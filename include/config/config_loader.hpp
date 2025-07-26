#pragma once

#include <string>
#include <unordered_map>

namespace canmqtt::config{

class ConfigLoader {
 public:
  static ConfigLoader& Instance();

  bool Load(const std::string& path);

  std::string Get(const std::string& section,
                         const std::string& key,
                         const std::string& def) const ;
    
  const std::unordered_map<std::string,std::unordered_map<std::string, std::string>>&
  DebugAll() const { return table_; }

 private:
  ConfigLoader() = default;
  std::unordered_map<std::string, std::unordered_map<std::string, std::string>> table_;


};

} 