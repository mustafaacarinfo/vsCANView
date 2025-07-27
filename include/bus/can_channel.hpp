// Copyright (c) 2025 Mustafa.Acar
// SPDX-License-Identifier: MIT
// -----------------------------------------------------------------------------
// CAN channel *interface* layer (header-only)
// -----------------------------------------------------------------------------

#pragma  once

#include <array>
#include <cstdint>
#include <string_view>
#include <vector>
#include <chrono>

namespace canmqtt::bus 
{

struct Frame {
    uint32_t id                 {};                       ///< 11-/29-bit identifier
    std::vector<uint8_t> data   {};                       ///< payload (0-8 B for classic)
    std::chrono::microseconds ts{};                       ///< monotonic timestamp
};

class ICanChannel {
    public:
        virtual ~ICanChannel() = default;
        virtual bool open(std::string_view ifname, bool fd_mode = false) = 0;
        virtual bool read(Frame& out) = 0;
        virtual void close() = 0;

        // non-copyable
        ICanChannel(const ICanChannel&)            = delete;
        ICanChannel& operator=(const ICanChannel&) = delete;

        // movable
        ICanChannel(ICanChannel&&) noexcept            = default;
        ICanChannel& operator=(ICanChannel&&) noexcept = default;
    protected:
        ICanChannel() = default;  ///< protected constructor to prevent instantiation
};

}




























