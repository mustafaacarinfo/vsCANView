#include "task/listener_task.hpp"
#include "config/config_loader.hpp"
#include "dbc/dbc_database.hpp"
#include "bus/socket_can_channel.hpp"

#include <nlohmann/json.hpp>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <chrono>
#include <thread>

using json = nlohmann::json;
using canmqtt::bus::Frame;
namespace cfg = canmqtt::config;
namespace dbc = canmqtt::dbc;
namespace bus = canmqtt::bus;

namespace canmqtt::task {

void StartListener()
{
    // ---- yardımcı --------------------------------------------------------
    auto to_hex = [](const uint8_t* d, size_t len)
    {
        std::ostringstream oss;
        oss << std::uppercase << std::hex << std::setfill('0');
        for (size_t i = 0; i < len; ++i)
        {
            oss << std::setw(2) << int(d[i]);
            if (i + 1 < len) oss << ' ';
        }
        return oss.str();
    };

    auto& cl = cfg::ConfigLoader::getInstance();
    auto& db = dbc::DbcDatabase::getInstance();
    auto& ch = bus::SocketCanChannel::getInstance();

    std::jthread{[&, to_hex]
    {
        Frame frame;
        json  j_canFrame;

        while (ch.read(frame))
        {            
           j_canFrame["ts"]  = std::chrono::duration_cast<std::chrono::microseconds>(frame.ts).count();
           j_canFrame["bus"] = cl.Get("can", "channel", "");
           j_canFrame["id"]  = frame.id;
           j_canFrame["dlc"] = static_cast<int>(frame.data.size());
           j_canFrame["raw"] = to_hex(frame.data.data(), frame.data.size());

           j_canFrame["name"] = db.getMessageNameById(frame.id);

            std::map<std::string,double> sigmap;
            if (db.decode(frame.id, frame.data, sigmap))
            j_canFrame["signals"] = sigmap;

            std::cout << j_canFrame.dump(2) << '\n';
        }

    }}.detach();
}

} // namespace canmqtt::task
