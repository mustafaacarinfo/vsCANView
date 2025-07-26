#include "task/task_macros.hpp"

int main() {
  V_INIT_TASK();
  V_LISTENER_TASK();
  /*V_PERIODIC_TASK();
  V_DISPLAY_TASK();
*/

  while (true) std::this_thread::sleep_for(std::chrono::hours(24));
  return 0;

}
