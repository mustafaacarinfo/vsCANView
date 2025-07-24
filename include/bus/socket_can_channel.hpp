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
        SocketCanChannel()  = default;
        ~SocketCanChannel() override { close(); }

        bool open(std::string_view ifname, bool fd_mode = false) override;
        bool read(Frame& out) override;
        void close() override;
        void setCallback(std::function<void(const Frame&)> cb);
        void startListening();

    private:
        int fd_ = -1;
        std::function<void(const Frame&)> m_messageCallback;

    };
}







