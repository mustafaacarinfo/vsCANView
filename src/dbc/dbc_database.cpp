#include "dbc/dbc_database.hpp"
#include <fstream>
#include <iostream>
#include <cstring>
#include <absl/base/no_destructor.h>  

namespace canmqtt::dbc {

DbcDatabase& DbcDatabase::getInstance()
{
    static absl::NoDestructor<DbcDatabase> instance;
   
    return *instance;
}

/* ───── load ───── */
bool DbcDatabase::load(const std::string& dbc_file)
{
    std::ifstream ifs(dbc_file);
    if (!ifs) 
    {
        std::cerr << "[DBC] File cannot opened: " << dbc_file << '\n';
        return false; 
    } 

    db_ = dbcppp::INetwork::LoadDBCFromIs(ifs);
    if (!db_)  
    {
        std::cerr << "[DBC] Parse failed\n"; return false; 
    }

    std::cout << "[DBC] File has been opened: " << dbc_file << '\n';

    return true;
}

/* ───── ID → Name (tam → SA’sız → PGN) ───── */
std::string DbcDatabase::getMessageNameById(uint32_t id) const
{
    if (!db_) return "";

    /* 1) Tam 29-bit ID */
    for (const auto& m : db_->Messages())
        if (m.Id() == id) return m.Name();

    /* 2) SA’sız */
    uint32_t no_sa = id & 0xFFFFFF00;
    for (const auto& m : db_->Messages())
        if ((m.Id() & 0xFFFFFF00) == no_sa) return m.Name();

    /* 3) Sadece PGN (18-bit) */
    uint32_t pgn = (id >> 8) & 0x3FFFF;
    for (const auto& m : db_->Messages())
        if (((m.Id() >> 8) & 0x3FFFF) == pgn) return m.Name();

    return "";
}

/* ───── decode ───── */
bool DbcDatabase::decode(uint32_t id,
                         const std::vector<uint8_t>& data,
                         std::map<std::string,double>& out) const
{
    out.clear();
    if (!db_) return false;

    /* Mesajı bul (tam → SA’sız → PGN) */
    const dbcppp::IMessage* msg = nullptr;

    for (const auto& m : db_->Messages())
        if (m.Id() == id) { msg = &m; break; }

    if (!msg) {
        uint32_t no_sa = id & 0xFFFFFF00;
        for (const auto& m : db_->Messages())
            if ((m.Id() & 0xFFFFFF00) == no_sa) { msg = &m; break; }
    }
    if (!msg) {
        uint32_t pgn = (id >> 8) & 0x3FFFF;
        for (const auto& m : db_->Messages())
            if (((m.Id() >> 8) & 0x3FFFF) == pgn) { msg = &m; break; }
    }
    if (!msg) return false;

    /* 8-bayt buffer (eksik kısımlar 0) */
    uint8_t buf[8]{0};
    std::memcpy(buf, data.data(), std::min<size_t>(data.size(), 8));

    const dbcppp::ISignal* mux = msg->MuxSignal();
    for (const dbcppp::ISignal& s : msg->Signals()) {
        if (s.MultiplexerIndicator() == dbcppp::ISignal::EMultiplexer::MuxValue &&
            mux && mux->Decode(buf) != s.MultiplexerSwitchValue())
            continue;

        out[s.Name()] = s.RawToPhys( s.Decode(buf) );
    }
    return !out.empty();
}

} // namespace dbc
