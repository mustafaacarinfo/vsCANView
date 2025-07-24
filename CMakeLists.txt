cmake_minimum_required(VERSION 3.15)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

project(CANfusion-MQ LANGUAGES CXX)

option(BUILD_FOR_PI "Pi için cross-compile" OFF)


if(BUILD_FOR_PI)
  message(STATUS ">>> Cross derleme: Pi hedefleniyor")
  set(CMAKE_TOOLCHAIN_FILE "${CMAKE_SOURCE_DIR}/toolchains/raspi.cmake" CACHE STRING "" FORCE)
else()
  message(STATUS ">>> Native derleme: Host makine")
endif()


file(GLOB SOURCES "${CMAKE_SOURCE_DIR}/src/*.cpp")

find_package(PkgConfig REQUIRED)
pkg_search_module(SOCKETCAN REQUIRED libsocketcan)

find_package(Curses REQUIRED)

# Paho kısmı kaldırıldı
# list(APPEND CMAKE_PREFIX_PATH "/usr/local/lib/cmake/eclipse-paho-mqtt-c")
# find_package(eclipse-paho-mqtt-c CONFIG REQUIRED)
# if(BUILD_FOR_PI)
#   pkg_search_module(PAHO REQUIRED libpaho-mqtt3c)
# endif()


########################Sub module DBCPP############################
add_definitions(-DBOOST_SPIRIT_X3_NO_CONTAINER_TRAITS)
add_definitions(-DBOOST_SPIRIT_X3_NO_FUSION)

add_subdirectory(third_party/dbcppp EXCLUDE_FROM_ALL)
add_executable(CANfusion-MQ ${SOURCES})
target_include_directories(CANfusion-MQ
    PRIVATE
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/third_party/dbcppp/src
)
###################################################################
target_include_directories(CANfusion-MQ PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${CURSES_INCLUDE_DIR}
)

target_link_libraries(CANfusion-MQ PRIVATE
  ${SOCKETCAN_LIBRARIES}
  dbcppp
  # eclipse-paho-mqtt-c::paho-mqtt3c
  pthread
  ${CURSES_LIBRARIES}
)
