// src/bus/can_channel_factory.cpp
#include "bus/can_channel.hpp"
#include "bus/socket_can_channel.hpp"
#include <iostream>
#include <memory>

// Opsiyonel PCAN entegrasyonu için Windows / Linux ayırımı yapılabilir.
#ifdef USE_PCAN
#include "bus/pcan_channel.hpp"
#endif

namespace canmqtt::bus {

ICanChannel* ICanChannel::create(std::string_view backend) {
    if (backend == "socketcan" || backend == "virtual" || backend == "vcan") {
#ifdef __linux__
    return &SocketCanChannel::getInstance();
#else
    std::cerr << "[ICanChannel::create] SocketCAN sadece Linux'ta desteklenir.\n";
    return nullptr;
#endif
    }
#ifdef USE_PCAN
    if (backend == "pcan") {
        return PcanChannel::instance();
    }
#else
    if (backend == "pcan") {
        std::cerr << "[ICanChannel::create] PCAN desteği derleme zamanında kapalı (USE_PCAN yok)\n";
        return nullptr;
    }
#endif
    std::cerr << "[ICanChannel::create] Bilinmeyen backend: " << backend << "\n";
    return nullptr;
}

}
