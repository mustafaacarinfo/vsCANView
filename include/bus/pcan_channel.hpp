// include/bus/pcan_channel.hpp
#pragma once

#include "bus/can_channel.hpp"
#include <cstdint>
#include <string_view>
#include <vector>
#include <memory>

#if defined(_WIN32)
#  include <windows.h>
#else
#  include <dlfcn.h>
#endif

// Minimal PCANBasic typedef'leri (dinamik yükleme ile)
namespace canmqtt::bus {

// PCANBasic sabitleri (PCANBasic.h içinden alınan gerekli kısımlar)
enum PcanStatus : uint32_t {
    PCAN_ERROR_OK = 0x00000,
};

// Kanal tipi (donanım handle). PCANBasic'te TPCANHandle = uint16_t
using PcanHandle = uint16_t;

// PCANBasic message struct (TPCANMsg)
struct PcanMsg {
    uint32_t id;      // 11/29 bit
    uint8_t  msgtype; // bit field (RTR, EXT, FD vs.) – şu an sadece EXT kontrol ederiz.
    uint8_t  len;     // DLC
    uint8_t  data[64];// FD için geniş tuttuk; klasik kullanımda ilk 8
};

// Fonksiyon pointer'ları (Windows'ta PCANBasic __stdcall kullanır)
#if defined(_WIN32)
    #define PCAN_CALL __stdcall
#else
    #define PCAN_CALL
#endif
using CAN_Initialize_t   = PcanStatus(PCAN_CALL *)(PcanHandle, uint16_t, uint32_t, uint8_t, uint8_t, uint8_t);
using CAN_Uninitialize_t = PcanStatus(PCAN_CALL *)(PcanHandle);
using CAN_Read_t         = PcanStatus(PCAN_CALL *)(PcanHandle, PcanMsg*, void* /*TPCANTimestamp**/);

class PcanChannel final : public ICanChannel {
public:
    static PcanChannel* instance();

    bool open(std::string_view ifname, bool fd_mode = false) override;
    bool read(Frame& out) override;
    void close() override;

private:
    PcanChannel() = default;
    bool loadLibrary();
    bool parseChannel(std::string_view ifname, PcanHandle &outHandle);
    bool opened_ {false};
    #if defined(_WIN32)
        HMODULE libHandle_ {nullptr};
    #else
        void* libHandle_ {nullptr};
    #endif
    PcanHandle handle_ {0};
    // Fonksiyon pointer'ları
    CAN_Initialize_t   fpInitialize_   {nullptr};
    CAN_Uninitialize_t fpUninitialize_ {nullptr};
    CAN_Read_t         fpRead_         {nullptr};
};

}
