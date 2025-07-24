# toolchains/raspi.cmake

set(CMAKE_SYSTEM_NAME    Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_SYSROOT        /opt/rpi-sysroot)
set(CMAKE_C_COMPILER     /opt/linaro-buster/bin/arm-linux-gnueabihf-gcc)
set(CMAKE_CXX_COMPILER   /opt/linaro-buster/bin/arm-linux-gnueabihf-g++)

set(CMAKE_C_FLAGS               "--sysroot=${CMAKE_SYSROOT} ${CMAKE_C_FLAGS}")
set(CMAKE_CXX_FLAGS             "--sysroot=${CMAKE_SYSROOT} ${CMAKE_CXX_FLAGS}")
set(CMAKE_EXE_LINKER_FLAGS      "--sysroot=${CMAKE_SYSROOT}")
set(CMAKE_SHARED_LINKER_FLAGS   "--sysroot=${CMAKE_SYSROOT}")

set(CMAKE_FIND_ROOT_PATH            ${CMAKE_SYSROOT})
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)


set(ENV{PKG_CONFIG_SYSROOT_DIR}   "${CMAKE_SYSROOT}")
set(ENV{PKG_CONFIG_LIBDIR}        "${CMAKE_SYSROOT}/usr/lib/pkgconfig:${CMAKE_SYSROOT}/usr/share/pkgconfig")