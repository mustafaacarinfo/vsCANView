// src/bus/socket_can_channel.cpp

#include "bus/socket_can_channel.hpp"
#ifdef __linux__
#include <linux/can.h>
#include <linux/can/raw.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>
#include <thread>
#include <climits>
#endif
#include <cstring>
#include <iostream>
#include <sstream>
#include <absl/base/no_destructor.h>  

namespace canmqtt::bus {

SocketCanChannel& SocketCanChannel::getInstance(){
    static absl::NoDestructor<SocketCanChannel> instance;

    return *instance;
}

bool SocketCanChannel::open(std::string_view ifname, bool /*fd_mode*/) {
#ifndef __linux__
    std::cerr << "[SocketCanChannel] SocketCAN sadece Linux'ta desteklenir.\n";
    return false;
#else
    if (fd_ != -1)
    {
        std::cerr << "[SocketCanChannel] Socket already open.\n";
        return false;
    }    
    fd_ = ::socket(PF_CAN, SOCK_RAW, CAN_RAW);
    if (fd_ < 0)
    {
        std::cerr << "[SocketCanChannel] Socket creation failed: " << strerror(errno) << "\n";
        return false;
    }

    ifreq ifr{};
    std::strncpy(ifr.ifr_name, ifname.data(), IFNAMSIZ - 1);
    if (ioctl(fd_, SIOCGIFINDEX, &ifr) < 0) {
        ::close(fd_);
        fd_ = -1;
    return false;
    }

    sockaddr_can addr{AF_CAN, ifr.ifr_ifindex};

    if (::bind(fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd_);
        fd_ = -1;
        return false;
    }

    std::cout << "[SocketCanChannel] " << ifname << " CAN Interface opened.\n" << std::endl;
    return true;  
#endif

}

bool SocketCanChannel::read(Frame& out) {
#ifndef __linux__
    (void)out; return false;
#else
    can_frame raw_frame{};
    ssize_t n = ::recv(fd_, &raw_frame, sizeof(raw_frame), 0);
    if (n != sizeof(raw_frame)) return false;
    out.id = raw_frame.can_id;
    out.data.assign(raw_frame.data, raw_frame.data + raw_frame.can_dlc);
    out.ts = std::chrono::duration_cast<std::chrono::microseconds>( std::chrono::steady_clock::now().time_since_epoch());
    return true;
#endif
}

void SocketCanChannel::close() {
#ifdef __linux__
    if (fd_ != -1) { ::close(fd_); fd_ = -1; }
#endif
}

void SocketCanChannel::startProcessingData(void) 
{/*
    Frame frame;
    read(frame);
    
    uint32_t plain = (frame.id & CAN_EFF_FLAG)
                    ? (frame.id & CAN_EFF_MASK)
                    : (frame.id & CAN_SFF_MASK);

    
    db.getMessageNameById(plain);          
    db.decode(plain, f.data, sigs);
*/
}

} // namespace canmqtt::bus
