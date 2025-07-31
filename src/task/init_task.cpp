// task/init_task.cpp
#include "task/init_task.hpp"

#include "config/config_loader.hpp"
#include "bus/socket_can_channel.hpp"
#include "dbc/dbc_database.hpp"
#include "mqtt/mqtt_publisher.hpp"

std::string stringdbc;

namespace canmqtt::task {
void Init() {

  auto& cfg = canmqtt::config::ConfigLoader::getInstance();
  cfg.Load("../conf/config.ini");

  auto& db = canmqtt::dbc::DbcDatabase::getInstance();
  db.load(cfg.Get("dbc", "file", ""));

  auto& ch = canmqtt::bus::SocketCanChannel::getInstance();
  ch.open(cfg.Get("can", "channel", ""));

  auto& mqtt_pub = canmqtt::mqtt::Publisher::getInstance();
  mqtt_pub.Init(cfg.Get("mqtt", "uri", ""),
                cfg.Get("mqtt", "client_id", ""),
                std::stoi(cfg.Get("mqtt", "keep_alive", ""),nullptr,16));
}
} 
