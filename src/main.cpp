#include <chrono>
#include <iomanip>
#include <iostream>
#include <map>
#include <thread>
#include <sstream>
#include <string>
#include <climits>
#include "bus/socket_can_channel.hpp"
#include "display/can_tui.hpp"
#include "dbc/dbc_database.hpp"

using namespace canmqtt::bus;

/* basit sahte metrikler */
static double cpuLoad(){ return 12.3; }
static double memUsage(){ return 350.0; }

int main()
{
    dbc::DbcDatabase db;
    if (!db.load("../conf/CAN_DATABASE.dbc")){
        std::cerr << "DBC yüklenemedi\n";
        return 1;
    }

    SocketCanChannel ch;
    if (!ch.open("vcan0")){
        perror("socket");
        return 1;
    }

    CanTui tui;
    const auto t0 = std::chrono::steady_clock::now();   // program başlangıcı

    ch.setCallback([&](const Frame& f){
        Row r;

        /* 1) Göreli zaman damgası 0.000 biçiminde */
        double secs = std::chrono::duration<double>(
                          std::chrono::steady_clock::now() - t0).count();
        std::ostringstream ts; ts << std::fixed << std::setprecision(3) << secs;
        r.ts = ts.str();

        /* 2) Bayraksız (plain) ID — hem DBC eşleşmesi hem ekrana yazım */
        uint32_t plain = (f.id & CAN_EFF_FLAG)
                       ? (f.id & CAN_EFF_MASK)
                       : (f.id & CAN_SFF_MASK);

        std::ostringstream id;
        id << "0x" << std::uppercase << std::hex
           << std::setw(8) << std::setfill('0') << plain;
        r.id = id.str();

        /* 3) DBC’den isim & sinyaller */
        r.name = db.getMessageNameById(plain);          
        r.dlc  = static_cast<int>(f.data.size());

        std::map<std::string,double> sigs;
        db.decode(plain, f.data, sigs);

        std::map<std::string,double> s; db.decode(plain,f.data,s);
        for (auto& kv : s) {
            if (!r.sigs.empty()) r.sigs += ", ";
            std::ostringstream vs; vs << std::fixed << std::setprecision(2) << kv.second;
            r.sigs += kv.first + '=' + vs.str();
        }

        auto utf8_trunc = [](std::string s, std::size_t max){
           if (s.size() <= max) return s;
           std::size_t i = max;
           /* UTF-8 devam baytları 0b10xxxxxx → 0x80-0xBF */
           while (i > 0 && (static_cast<unsigned char>(s[i]) & 0xC0) == 0x80) --i;
           return s.substr(0, i) + " …";
       };
       r.sigs = utf8_trunc(r.sigs, 1024);
        tui.addRow(std::move(r));
    });
    ch.startListening();

    /* Ana döngü */
    while (tui.pollInput()){
        tui.render(cpuLoad(), memUsage());
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    return 0;
}
