#pragma once

#include <string>
#include <unordered_map>
#include <absl/base/no_destructor.h>  

namespace canmqtt::config{

class ConfigLoader {
 public:
  static ConfigLoader& getInstance();

  bool Load(const std::string& path);

  std::string Get(const std::string& section,
                         const std::string& key,
                         const std::string& def) const ;
    
  const std::unordered_map<std::string,std::unordered_map<std::string, std::string>>&
  DebugAll() const { return table_; }

 private:
  ConfigLoader() = default;
  std::unordered_map<std::string, std::unordered_map<std::string, std::string>> table_;
  friend class absl::NoDestructor<ConfigLoader>;


};

} 