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
  std::cout << "[Init] Starting init..." << std::endl;
  // Config arama: çalışma dizini kök (./conf), build/Release içinde çalışırken ../conf fallback
  if(!cfg.Load("conf/config.ini")) {
    if(!cfg.Load("../conf/config.ini")) {
      std::cerr << "[Init] Config bulunamadı (conf/config.ini veya ../conf/config.ini)" << std::endl;
    }
  }

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
  auto uri = cfg.Get("mqtt","uri","");
  auto cid = cfg.Get("mqtt","client_id","");
  auto keepStr = cfg.Get("mqtt","keep_alive","60");
  int keepAlive = 60;
  try {
    // Önce decimal dene; hex ise 0x veya sadece harf içeriyorsa fallback
    keepAlive = std::stoi(keepStr, nullptr, 10);
  } catch(...) {
    try { keepAlive = std::stoi(keepStr, nullptr, 16); } catch(...) { keepAlive = 60; }
  }
  std::cout << "[Init] MQTT uri=" << uri << " client_id=" << cid << " keep=" << keepAlive << std::endl;
  mqtt_pub.Init(uri, cid, keepAlive);
}
} 
