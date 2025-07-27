// src/bus/socket_can_channel.cpp

#include "bus/socket_can_channel.hpp"
#include <linux/can.h>
#include <linux/can/raw.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstring>
#include <thread>
#include <iostream>
#include <sstream>
#include <climits>
#include <absl/base/no_destructor.h>  

namespace canmqtt::bus {

SocketCanChannel& SocketCanChannel::getInstance(){
    static absl::NoDestructor<SocketCanChannel> instance;

    return *instance;
}

bool SocketCanChannel::open(std::string_view ifname, bool /*fd_mode*/) {
    if (fd_ != -1) return false;
    fd_ = ::socket(PF_CAN, SOCK_RAW, CAN_RAW);
    if (fd_ < 0) return false;
        
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

}

bool SocketCanChannel::read(Frame& out) {
    can_frame raw_frame{};
    ssize_t n = ::recv(fd_, &raw_frame, sizeof(raw_frame), 0);
    if (n != sizeof(raw_frame)) return false;

    // -- DÜZELTME: ham can_id içindeki bayrakları da koru
    out.id = raw_frame.can_id;

    // Data ve timestamp
    out.data.assign(raw_frame.data, raw_frame.data + raw_frame.can_dlc);
    out.ts = std::chrono::duration_cast<std::chrono::microseconds>(
                std::chrono::steady_clock::now().time_since_epoch());

    return true;
}

void SocketCanChannel::close() {
    if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
    }
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
