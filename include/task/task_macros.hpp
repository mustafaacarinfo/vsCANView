#pragma once

#include "task/init_task.hpp"
#include "task/listener_task.hpp"
#include "task/periodic_task.hpp"
#include "task/display_task.hpp"
#include <thread>

#define V_INIT_TASK()      ::canmqtt::task::Init()
#define V_LISTENER_TASK()  ::canmqtt::task::StartListener()
#define V_PERIODIC_TASK()  ::canmqtt::task::StartPeriodic()
#define V_DISPLAY_TASK()   ::canmqtt::task::StartDisplay()