#pragma once

#include <nlohmann/json.hpp>
#include "bus/socket_can_channel.hpp"
#include "dbc/dbc_database.hpp"
#include "config/config_loader.hpp"

#include <iostream>
#include <iomanip>
#include <sstream>
#include <chrono>

using canmqtt_json = nlohmann::json;
using namespace canmqtt::bus;

namespace canmqtt::util::json
{
    auto to_hex = [](const uint8_t *d, size_t len)
    {
      std::ostringstream oss;
      oss << std::uppercase << std::hex << std::setfill('0');
      for (size_t i = 0; i < len; ++i)
      {
        oss << std::setw(2) << int(d[i]);
        if (i + 1 < len)
          oss << ' ';
      }
      return oss.str();
    };

    bool BuildJson(canmqtt_json  &j_canFrame, Frame &frame, auto &cl, auto &db)
    {
        j_canFrame["ts"] = std::chrono::duration_cast<std::chrono::microseconds>(frame.ts).count();
        j_canFrame["bus"] = cl.Get("can", "channel", "");
        j_canFrame["id"] = frame.id;
        j_canFrame["dlc"] = static_cast<int>(frame.data.size());
        j_canFrame["raw"] = to_hex(frame.data.data(), frame.data.size());
        j_canFrame["name"] = db.getMessageNameById(frame.id);
        std::map<std::string, double> sigmap;

        if (db.decode(frame.id, frame.data, sigmap))
            j_canFrame["signals"] = sigmap;

        std::cout << j_canFrame.dump(2) << '\n';


        return true;
    }

} // namespace
