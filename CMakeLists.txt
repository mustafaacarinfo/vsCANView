cmake_minimum_required(VERSION 3.15)
project(vsCANView LANGUAGES CXX)

# ───────── Derleyici ayarları ─────────
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Varsayılan derleme tipi (multi-config değilse)
if(NOT CMAKE_CONFIGURATION_TYPES AND NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Debug CACHE STRING "Choose build type" FORCE)
endif()

# ───────── Cross-compile seçeneği ─────────
option(BUILD_FOR_PI "Pi için cross-compile" OFF)
if(BUILD_FOR_PI)
  message(STATUS ">>> Cross derleme: Pi hedefleniyor")
  set(CMAKE_TOOLCHAIN_FILE "${CMAKE_SOURCE_DIR}/toolchains/raspi.cmake" CACHE STRING "" FORCE)
else()
  message(STATUS ">>> Native derleme: Host makine")
endif()

# ───────── Kaynak dosyaları ─────────
file(GLOB_RECURSE SOURCES CONFIGURE_DEPENDS
     ${CMAKE_SOURCE_DIR}/src/*.cpp)

# ───────── Haricî kütüphaneler ─────────
find_package(Threads REQUIRED)        # Hem Windows hem Linux için güvenli
if(NOT WIN32)
  find_package(PkgConfig REQUIRED)
endif()

# ───────── Üçüncü taraf alt modüller ─────────
add_definitions(-DBOOST_SPIRIT_X3_NO_CONTAINER_TRAITS -DBOOST_SPIRIT_X3_NO_FUSION)

# dbcppp: KCD'yi kapat ve Windows için export tanımla
set(build_kcd OFF CACHE BOOL "Enable support for KCD parsing" FORCE)
add_subdirectory(third_party/dbcppp EXCLUDE_FROM_ALL)
if(WIN32)
  # DBCPPP_API makrosunun __declspec(dllexport) olmasını sağlar
  target_compile_definitions(dbcppp PRIVATE DBCPPP_EXPORT)
endif()

add_subdirectory(third_party/abseil)
add_subdirectory(third_party/json)
option(PAHO_WITH_SSL "Enable TLS support" OFF)
add_subdirectory(third_party/paho-mqtt-c EXCLUDE_FROM_ALL)
add_subdirectory(third_party/fmt EXCLUDE_FROM_ALL)

# ───────── Uygulama hedefi ─────────
add_executable(vsCANView ${SOURCES})

# PCANBasic otomatik bul/kopyala
option(ENABLE_PCAN "Enable PCAN backend" OFF)
if(ENABLE_PCAN)
  set(PCANBASIC_ROOT    "${CMAKE_SOURCE_DIR}/third_party/PCANBasic"      CACHE PATH     "PCANBasic root directory")
  set(PCANBASIC_INCLUDE "${PCANBASIC_ROOT}/Include"                       CACHE PATH     "PCANBasic include directory")
  set(PCANBASIC_DLL     "${PCANBASIC_ROOT}/x64/PCANBasic.dll"             CACHE FILEPATH "PCANBasic DLL (Windows)")
  set(PCANBASIC_SO      "${PCANBASIC_ROOT}/lib/libpcanbasic.so"           CACHE FILEPATH "PCANBasic SO (Linux)")

  target_include_directories(vsCANView PRIVATE "${PCANBASIC_INCLUDE}")
  target_compile_definitions(vsCANView PRIVATE USE_PCAN=1)

  if(WIN32)
    if(EXISTS "${PCANBASIC_DLL}")
      add_custom_command(TARGET vsCANView POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different "${PCANBASIC_DLL}" "$<TARGET_FILE_DIR:vsCANView>/PCANBasic.dll"
        COMMENT "PCANBasic.dll kopyalanıyor")
    else()
      message(WARNING "PCANBasic.dll bulunamadı: ${PCANBASIC_DLL}")
    endif()
  else()
    if(NOT EXISTS "${PCANBASIC_SO}")
      message(WARNING "libpcanbasic.so bulunamadı: ${PCANBASIC_SO}")
    endif()
  endif()
endif()

# Dahil dizinleri
target_include_directories(vsCANView PRIVATE
  ${CMAKE_SOURCE_DIR}/include
  ${CMAKE_SOURCE_DIR}/third_party/paho-mqtt-c/src
)

# Linkler
target_link_libraries(vsCANView PRIVATE
  dbcppp
  Threads::Threads
  nlohmann_json::nlohmann_json
  paho-mqtt3c
  fmt::fmt
)

# Platforma özel
if(UNIX)
  target_link_libraries(vsCANView PRIVATE dl)
endif()

# SocketCAN sadece Linux'ta
option(ENABLE_SOCKETCAN "Enable building with libsocketcan" ON)
if(ENABLE_SOCKETCAN AND NOT WIN32)
  pkg_search_module(SOCKETCAN libsocketcan)
  if(SOCKETCAN_FOUND)
    target_include_directories(vsCANView PRIVATE ${SOCKETCAN_INCLUDE_DIRS})
    target_link_libraries(vsCANView PRIVATE ${SOCKETCAN_LIBRARIES})
    message(STATUS "libsocketcan bulundu: ${SOCKETCAN_LIBRARIES}")
  else()
    message(WARNING "libsocketcan bulunamadı; -DENABLE_SOCKETCAN=OFF ile kapatabilirsiniz.")
  endif()
endif()
