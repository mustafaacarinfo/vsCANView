#pragma once
#include <dbcppp/Network.h>
#include <memory>
#include <string>
#include <map>
#include <vector>
#include <cstdint>

namespace dbc {

class DbcDatabase {
public:
    bool load(const std::string& dbc_file);

    /// id’li mesajı çözüp (isim-değer) tablosu döndürür
    bool decode(uint32_t id,
                const std::vector<uint8_t>& data,
                std::map<std::string, double>& out) const;

    std::string getMessageNameById(uint32_t id) const;

private:
    std::unique_ptr<dbcppp::INetwork> db_;
};

} // namespace dbc
