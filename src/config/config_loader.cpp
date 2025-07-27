#include "config/config_loader.hpp"

#include <iostream>
#include <fstream>
#include <sstream>
#include <absl/base/no_destructor.h>  

using namespace std;
namespace canmqtt::config {

ConfigLoader& ConfigLoader::Instance() {
  static absl::NoDestructor<ConfigLoader> instance;
  return *instance;
}

bool ConfigLoader::Load(const std::string& path) {
  std::ifstream in(path);
  if (!in) return false;

  std::string line, section;
  while (std::getline(in, line)) {
    if (line.empty() || line[0] == ';' || line[0] == '#') continue;
    if (line.front() == '[' && line.back() == ']') {
      section = line.substr(1, line.size() - 2);
      continue;
    }
    auto pos = line.find('=');
    if (pos == std::string::npos) continue;
    std::string key = line.substr(0, pos);
    std::string val = line.substr(pos + 1);
    table_[section][key] = val;
  }
  return true;
}

std::string ConfigLoader::Get(const std::string& section,
                                     const std::string& key,
                                     const std::string& def) const {

  auto s_it = table_.find(section);
  if (s_it == table_.end()) return def;

  auto k_it = s_it->second.find(key);

  if (k_it == s_it->second.end()) return def;
  return k_it->second;
}

}  // namespace canmqtt::config
