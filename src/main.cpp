#include "task/task_macros.hpp"
#include <iostream>
#include <chrono>
#include <thread>

int main() {
  // Debug marker file
  if(FILE* mf = fopen("startup_marker.txt","a")) { fputs("enter main\n", mf); fclose(mf); }
  std::cout.setf(std::ios::unitbuf); // auto flush
  std::cout << "vsCANView starting..." << std::endl;
  V_INIT_TASK();
  V_LISTENER_TASK();
  V_PERIODIC_TASK();
  /*V_DISPLAY_TASK();*/
  std::cout << "Initialization scheduled. Waiting for CAN frames / MQTT..." << std::endl;
  while (true) std::this_thread::sleep_for(std::chrono::hours(24));
  return 0;
}
