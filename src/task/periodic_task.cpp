#include "task/periodic_task.hpp"

#include <chrono>
#include <iostream>
#include <thread>
#include <chrono>
#include <iomanip>
#include <stop_token>

#include "config/config_loader.hpp"

namespace canmqtt::task {

using namespace std::chrono;

void StartPeriodic() {
  using namespace std::chrono_literals;
  int interval_ms = std::stoi(
      canmqtt::config::ConfigLoader::getInstance().Get("os",
                                         "periodic_task_interval_ms",
                                         "50"));
  std::jthread
  {
    [interval_ms](void) 
    {
      while (true) {
        //std::cout << "Periodic task running every " << interval_ms << " ms" <<   << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(interval_ms));
      }
    }
  }.detach();
}

}  // namespace task
