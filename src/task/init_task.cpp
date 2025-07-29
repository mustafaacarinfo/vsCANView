// task/init_task.cpp
#include "task/init_task.hpp"

#include "config/config_loader.hpp"
#include "bus/socket_can_channel.hpp"
#include "dbc/dbc_database.hpp"

std::string stringdbc;

namespace canmqtt::task {
void Init() {

  auto& cfg = canmqtt::config::ConfigLoader::getInstance();
  cfg.Load("../conf/config.ini");

  auto& db = canmqtt::dbc::DbcDatabase::getInstance();
  db.load(cfg.Get("dbc", "file", ""));

  auto& ch = canmqtt::bus::SocketCanChannel::getInstance();
  ch.open(cfg.Get("can", "channel", ""));
}
} 
