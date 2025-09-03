# ────────────────── PCANBasic header ve kütüphane otomatik bulma ──────────────────
set(PCANBASIC_ROOT "${CMAKE_SOURCE_DIR}/third_party/PCANBasic" CACHE PATH "PCANBasic root directory")
set(PCANBASIC_INCLUDE "${PCANBASIC_ROOT}/Include" CACHE PATH "PCANBasic include directory")
set(PCANBASIC_LIB_WIN "${PCANBASIC_ROOT}/x64/PCANBasic.dll" CACHE FILEPATH "PCANBasic DLL (Windows)")
set(PCANBASIC_LIB_LINUX "${PCANBASIC_ROOT}/lib/libpcanbasic.so" CACHE FILEPATH "PCANBasic SO (Linux)")

if(WIN32)
  file(COPY ${PCANBASIC_LIB_WIN} DESTINATION ${CMAKE_BINARY_DIR})
  target_include_directories(vsCANView PRIVATE ${PCANBASIC_INCLUDE})
endif()
if(UNIX)
  target_include_directories(vsCANView PRIVATE ${PCANBASIC_INCLUDE})
endif()
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
option(ENABLE_SOCKETCAN "Enable building with libsocketcan" ON)
if(ENABLE_SOCKETCAN)
  pkg_search_module(SOCKETCAN libsocketcan)
  if (SOCKETCAN_FOUND)
    message(STATUS "libsocketcan bulundu: ${SOCKETCAN_LIBRARIES}")
  else()
    message(WARNING "libsocketcan bulunamadı; SocketCAN link kütüphanesi olmadan devam edilecek (kernel raw soket API zaten kullanılıyor). Kapatmak için -DENABLE_SOCKETCAN=OFF geçebilirsiniz.")
  endif()
endif()

# ────────────────── Üçüncü taraf alt modüller ──────────────────
add_definitions(-DBOOST_SPIRIT_X3_NO_CONTAINER_TRAITS -DBOOST_SPIRIT_X3_NO_FUSION)
add_subdirectory(third_party/dbcppp EXCLUDE_FROM_ALL)
add_subdirectory(third_party/abseil)           
add_subdirectory(third_party/json)            
option(PAHO_WITH_SSL "Enable TLS support" OFF)
add_subdirectory(third_party/paho-mqtt-c EXCLUDE_FROM_ALL)
add_subdirectory(third_party/fmt EXCLUDE_FROM_ALL)


# ────────────────── Uygulama hedefi ──────────────────
add_executable(vsCANView ${SOURCES})

target_include_directories(vsCANView PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${CMAKE_SOURCE_DIR}/third_party/dbcppp/src
  ${CMAKE_SOURCE_DIR}/third_party/paho-mqtt-c/src
)

target_link_libraries(vsCANView PRIVATE
  dbcppp
  pthread
  absl::base
  nlohmann_json::nlohmann_json
  paho-mqtt3c
  fmt::fmt
  dl
)
if(ENABLE_SOCKETCAN AND SOCKETCAN_FOUND)
  target_link_libraries(vsCANView PRIVATE ${SOCKETCAN_LIBRARIES})
endif()

# ────────────────── Opsiyonel PCAN desteği ──────────────────
option(ENABLE_PCAN "Enable PCAN backend" OFF)
if(ENABLE_PCAN)
  target_compile_definitions(vsCANView PRIVATE USE_PCAN=1)
  # Burada gerçek PCANBasic kütüphanesi tespiti yapılmalı. Kullanıcıdan PCAN SDK yolunu vermesi istenebilir.
  # find_library(PCAN_LIB PCANBasic PATHS /opt/pcan /usr/lib /usr/local/lib)
  # if(PCAN_LIB)
  #   target_link_libraries(vsCANView PRIVATE ${PCAN_LIB})
  # else()
  #   message(WARNING "PCAN library not found; building with stub implementation")
  # endif()
endif()
