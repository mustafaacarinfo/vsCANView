#include "task/listener_task.hpp"
#include "dbc/dbc_database.hpp"
#include "bus/socket_can_channel.hpp"
#include "mqtt/mqtt_publisher.hpp"
#include "config/config_loader.hpp"
#include "util/util.hpp"

#include <nlohmann/json.hpp>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <chrono>
#include <thread>
#include <fmt/core.h>         

using canmqtt::bus::Frame;
using json = nlohmann::json;

namespace cfg = canmqtt::config;
namespace dbc = canmqtt::dbc;
namespace bus = canmqtt::bus;
namespace mqtt = canmqtt::mqtt;
namespace build_json = canmqtt::util::json;

namespace canmqtt::task
{

  void StartListener()
  {
    auto &cl = cfg::ConfigLoader::getInstance();
    auto &db = dbc::DbcDatabase::getInstance();
    auto &ch = bus::SocketCanChannel::getInstance();
    auto &mqtt_pub = mqtt::Publisher::getInstance();

    std::jthread{
        [&]{
          Frame frame;
          json j_canFrame;

          while (ch.read(frame))
          {
            if(build_json::BuildJson(j_canFrame,frame,cl,db) == false)
            {
              std::cerr << "Failed to build JSON for CAN frame with ID: " << frame.id << '\n';
              continue;
            }
            
            std::string bus = cl.Get("can", "channel", "");
            std::string topic = fmt::format("can/{}/{:06X}", bus, frame.id);

            mqtt_pub.Publish(topic, j_canFrame.dump(2), 1/*td::stoi(cl.Get("mqtt", "qos", ""),nullptr, 16)*/);
          }
        }}
        .detach();
  }

} // namespace canmqtt::task
