cmake_minimum_required(VERSION 3.15)
project(vsCANView LANGUAGES CXX)

# ────────────────── Derleyici ayarları ──────────────────
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Varsayılan derleme tipi
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug CACHE STRING "Choose build type" FORCE)
endif()
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -g -O0")

# ────────────────── Cross-compile seçeneği ──────────────────
option(BUILD_FOR_PI "Pi için cross-compile" OFF)
if(BUILD_FOR_PI)
  message(STATUS ">>> Cross derleme: Pi hedefleniyor")
  set(CMAKE_TOOLCHAIN_FILE "${CMAKE_SOURCE_DIR}/toolchains/raspi.cmake" CACHE STRING "" FORCE)
else()
  message(STATUS ">>> Native derleme: Host makine")
endif()

# ────────────────── Kaynak dosyaları topla ──────────────────
# GLOB_RECURSE zaten src/main.cpp'i de yakalar; extra append gereksiz
file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS
     ${CMAKE_SOURCE_DIR}/src/*.cpp)

# ────────────────── Haricî kütüphaneler ──────────────────
find_package(PkgConfig REQUIRED)
pkg_search_module(SOCKETCAN REQUIRED libsocketcan)
find_package(Curses REQUIRED)

# ────────────────── Üçüncü taraf alt modüller ──────────────────
add_definitions(-DBOOST_SPIRIT_X3_NO_CONTAINER_TRAITS -DBOOST_SPIRIT_X3_NO_FUSION)
add_subdirectory(third_party/dbcppp EXCLUDE_FROM_ALL)
add_subdirectory(third_party/abseil)            # absl::base hedefini üretir

# ────────────────── Uygulama hedefi ──────────────────
add_executable(vsCANView ${SOURCES})

target_include_directories(vsCANView PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${CMAKE_SOURCE_DIR}/third_party/dbcppp/src
  ${CURSES_INCLUDE_DIR}
)

target_link_libraries(vsCANView PRIVATE
  ${SOCKETCAN_LIBRARIES}
  dbcppp
  pthread
  ${CURSES_LIBRARIES}
  absl::base                # ← artık exe tanımlandıktan SONRA listede
)
