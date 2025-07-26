#include "bus/can_channel.hpp"


#include <linux/can.h>
#include <linux/can/raw.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstring>
#include <functional>

namespace canmqtt::bus {

class SocketCanChannel : public ICanChannel {
    public:
        SocketCanChannel(const SocketCanChannel&)            = delete; // non-copyable
        SocketCanChannel& operator=(const SocketCanChannel&) = delete; // non-copyable
        SocketCanChannel(SocketCanChannel&&) noexcept            = default; // movable
        SocketCanChannel& operator=(SocketCanChannel&&) noexcept = default; // movable

        ~SocketCanChannel() override { close(); }

        static SocketCanChannel& getInstance();
        bool open(std::string_view ifname, bool fd_mode = false) override;
        bool read(Frame& out) override;
        void close() override;
        void startProcessingData();         
    private:
        SocketCanChannel()  = default;
        int fd_ = -1;
    };
}







