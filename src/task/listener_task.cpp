#include "task/listener_task.hpp"
#include "dbc/dbc_database.hpp"
#include "bus/socket_can_channel.hpp"

#include <iostream>
#include <thread>

using namespace std;
using canmqtt::bus::SocketCanChannel;
using canmqtt::bus::Frame;

namespace canmqtt::task {

void StartListener() {
  std::jthread{[] {

    SocketCanChannel &ch = SocketCanChannel::getInstance();
    Frame frame;
    int i =0 ;
    while (ch.read(frame)) {
      cout << endl << "Received CAN frame: ID = " << frame.id << endl;
      cout << "Received CAN frame: Data = ";
      for (const auto& byte : frame.data) {
        cout << std::hex << static_cast<int>(byte) << " " << std::uppercase; 
      }
      cout << endl << "Timestamp: " << frame.ts.count() << " microseconds" << endl;
      cout << "Message Name: " << canmqtt::dbc::DbcDatabase::getInstance().getMessageNameById(frame.id) << endl;
      cout << "----------------------------------------" << endl;

      i = (i + 1) % frame.data.size();

      uint32_t plain = (frame.id & CAN_EFF_FLAG)
                  ? (frame.id & CAN_EFF_MASK)
                  : (frame.id & CAN_SFF_MASK);

      std::map<std::string,double> decoded_data;
      canmqtt::dbc::DbcDatabase::getInstance().decode(plain, frame.data,decoded_data);
      cout << "Signals: ";
      for (const auto& sig : decoded_data) {
        cout << sig.first << ": " << sig.second << ", ";
      }
      cout << endl;
      
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
  }}.detach();

}

}  // namespace task
