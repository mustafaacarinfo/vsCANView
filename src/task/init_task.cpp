// task/init_task.cpp
#include "task/init_task.hpp"

#include "config/config_loader.hpp"
#include "bus/can_channel.hpp"
#include "dbc/dbc_database.hpp"
#include "mqtt/mqtt_publisher.hpp"

std::string stringdbc;

namespace canmqtt::task {
void Init() {

  auto& cfg = canmqtt::config::ConfigLoader::getInstance();
  cfg.Load("../conf/config.ini");

  auto& db = canmqtt::dbc::DbcDatabase::getInstance();
  db.load(cfg.Get("dbc", "file", ""));

  auto backend = cfg.Get("can","backend","socketcan");
  auto* ch = canmqtt::bus::ICanChannel::create(backend);
  if(!ch){
    std::cerr << "[Init] CAN backend oluşturulamadı: " << backend << "\n";
  } else if(!ch->open(cfg.Get("can", "channel", ""))){
    std::cerr << "[Init] CAN backend açılamadı: " << backend << "\n";
  }

  auto& mqtt_pub = canmqtt::mqtt::Publisher::getInstance();
  mqtt_pub.Init(cfg.Get("mqtt", "uri", ""),
                cfg.Get("mqtt", "client_id", ""),
                std::stoi(cfg.Get("mqtt", "keep_alive", ""),nullptr,16));
}
} 
