#pragma once
#include <dbcppp/Network.h>
#include <memory>
#include <string>
#include <map>
#include <vector>
#include <cstdint>
#include <absl/base/no_destructor.h>  

namespace canmqtt::dbc {

class DbcDatabase {
public:
    ~DbcDatabase() = default;
    DbcDatabase(DbcDatabase&&) = default; // movable
    DbcDatabase& operator=(const DbcDatabase&) = delete; // non-copyable
    DbcDatabase& operator=(DbcDatabase&&) = default; // movable

    bool load(const std::string& dbc_file);

    /// id’li mesajı çözüp (isim-değer) tablosu döndürür
    bool decode(uint32_t id,
                const std::vector<uint8_t>& data,
                std::map<std::string, double>& out) const;

    std::string getMessageNameById(uint32_t id) const;

    static DbcDatabase& getInstance();

private:
    DbcDatabase() = default;
    friend class absl::NoDestructor<DbcDatabase>;
    std::unique_ptr<dbcppp::INetwork> db_;
};

} // namespace dbc
