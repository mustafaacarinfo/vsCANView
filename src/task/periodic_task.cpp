#include "task/periodic_task.hpp"

#include <chrono>
#include <iostream>
#include <thread>

#include "config/config_loader.hpp"

namespace canmqtt::task {

void StartPeriodic() {
  using namespace std::chrono_literals;
  int interval_ms = std::stoi(
      canmqtt::config::ConfigLoader::Instance().Get("os",
                                         "periodic_task_interval_ms",
                                         "50"));
  std::jthread{[interval_ms] {
    while (true) {
      std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
    }
  }}.detach();
}

}  // namespace task
