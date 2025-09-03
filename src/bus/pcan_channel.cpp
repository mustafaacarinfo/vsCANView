// PCAN hata kodunu string'e çeviren yardımcı
static const char* pcanStatusToStr(PcanStatus st) {
    switch(st) {
        case PCAN_ERROR_OK: return "OK";
        default: return "Bilinmeyen hata";
    }
}
// src/bus/pcan_channel.cpp
#include "bus/pcan_channel.hpp"
#include "config/config_loader.hpp"
#include <iostream>
#include <regex>
#include <thread>
#include <chrono>
#if defined(_WIN32)
#  include <windows.h>
#else
#  include <dlfcn.h>
#endif

namespace canmqtt::bus {

// Bitrate map (PCANBasic baudrate çarpanı). Basit standart değerler.
static uint16_t mapBitrate(const std::string& br) {
    if(br=="1M"||br=="1000K") return 0x0014; // PCAN_BAUD_1M
    if(br=="800K") return 0x0016;             // PCAN_BAUD_800K
    if(br=="500K") return 0x001C;             // PCAN_BAUD_500K
    if(br=="250K") return 0x011C;             // PCAN_BAUD_250K
    if(br=="125K") return 0x031C;             // PCAN_BAUD_125K
    if(br=="100K") return 0x432F;             // PCAN_BAUD_100K
    if(br=="50K")  return 0x472F;             // PCAN_BAUD_50K
    if(br=="20K")  return 0x672F;             // PCAN_BAUD_20K
    if(br=="10K")  return 0x7F7F;             // PCAN_BAUD_10K
    return 0x031C; // default 125K
}

PcanChannel* PcanChannel::instance() {
    static PcanChannel inst;
    return &inst;
}

bool PcanChannel::loadLibrary() {
    if(libHandle_) return true;
#if defined(_WIN32)
    const wchar_t* candidatesW[] = {L"PCANBasic.dll"};
    for(auto c : candidatesW) {
        libHandle_ = LoadLibraryW(c);
        if(libHandle_) break;
    }
    if(!libHandle_) {
        std::cerr << "[PcanChannel] PCANBasic.dll bulunamadı (PATH)\n";
        return false;
    }
    auto loadSym = [&](const char* name){ return reinterpret_cast<void*>(GetProcAddress(libHandle_, name)); };
#else
    const char* candidates[] = {"libpcanbasic.so", "libpcanbasic.so.1"};
    for(auto c : candidates) {
        libHandle_ = dlopen(c, RTLD_LAZY);
        if(libHandle_) break;
    }
    if(!libHandle_) {
        std::cerr << "[PcanChannel] libpcanbasic.so bulunamadı (LD_LIBRARY_PATH)\n";
        return false;
    }
    auto loadSym = [&](const char* name){ return dlsym(libHandle_, name); };
#endif
    fpInitialize_   = reinterpret_cast<CAN_Initialize_t>(loadSym("CAN_InitializeFD"));
    if(!fpInitialize_) fpInitialize_ = reinterpret_cast<CAN_Initialize_t>(loadSym("CAN_Initialize"));
    fpUninitialize_ = reinterpret_cast<CAN_Uninitialize_t>(loadSym("CAN_Uninitialize"));
    fpRead_         = reinterpret_cast<CAN_Read_t>(loadSym("CAN_Read"));
    if(!fpInitialize_ || !fpUninitialize_ || !fpRead_) {
        std::cerr << "[PcanChannel] Gerekli semboller bulunamadı\n";
        return false;
    }
    return true;
}

bool PcanChannel::parseChannel(std::string_view ifname, PcanHandle &outHandle) {
    // Beklenen format ör: PCAN_USBBUS1 -> USBBUS1 içindeki rakam kanalı belirler
    std::regex usbRe("PCAN_USBBUS([0-9]+)");
    std::cmatch m;
    if(std::regex_match(ifname.begin(), ifname.end(), m, usbRe) && m.size()==2) {
        int idx = std::stoi(m[1]);
        // PCANBasic: 0x51 + (index-1) gibi (örnek) — gerçek handle sabitleri PCANBasic.h içinde
        // Örnek: PCAN_USBBUS1 = 0x51, PCAN_USBBUS2 = 0x52 ...
        outHandle = static_cast<PcanHandle>(0x50 + idx);
        return true;
    }
    std::cerr << "[PcanChannel] Kanal formatı tanınmadı: " << ifname << '\n';
    return false;
}

bool PcanChannel::open(std::string_view ifname, bool /*fd_mode*/) {
    if(opened_) return true;
    if(!loadLibrary()) return false;
    if(!parseChannel(ifname, handle_)) return false;

    // Bitrate config.ini'den okunuyor
    auto& cfg = canmqtt::config::ConfigLoader::getInstance();
    std::string bitrateStr = cfg.Get("can", "bitrate", "500K");
    uint16_t bitrate = mapBitrate(bitrateStr);
    if(fpInitialize_(handle_, bitrate, 0,0,0,0) != PCAN_ERROR_OK) {
        std::cerr << "[PcanChannel] CAN_Initialize başarısız (bitrate: " << bitrateStr << ")\n";
        return false;
    }
    opened_ = true;
    std::cout << "[PcanChannel] Açıldı: " << ifname << " (bitrate: " << bitrateStr << ")\n";
    return true;
}

bool PcanChannel::read(Frame& out) {
    if(!opened_) return false;
    PcanMsg msg{}; 
    auto st = fpRead_(handle_, &msg, nullptr);
    if(st != PCAN_ERROR_OK) {
        std::cerr << "[PcanChannel] CAN_Read hata: " << pcanStatusToStr(st) << "\n";
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
        return true; // Thread devam etsin ama çerçeve yok.
    }
    out.id = msg.id; // EXT/RTR maskesine ileride bakılabilir
    out.data.assign(msg.data, msg.data + std::min<size_t>(msg.len, 8));
    out.ts = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch());
    return true;
}

void PcanChannel::close() {
    if(opened_ && fpUninitialize_) {
        fpUninitialize_(handle_);
        opened_ = false;
        std::cout << "[PcanChannel] Kapatıldı\n";
    }
    if(libHandle_) {
#if defined(_WIN32)
    FreeLibrary(libHandle_);
#else
    dlclose(libHandle_);
#endif
    libHandle_ = nullptr;
    }
}

}
