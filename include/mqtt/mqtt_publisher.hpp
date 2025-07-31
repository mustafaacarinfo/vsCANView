#pragma once

#include <string>
#include <MQTTClient.h>
#include <absl/base/no_destructor.h>  

namespace canmqtt::mqtt
{

    class Publisher
    {
    public:
        Publisher(const Publisher&) = delete; // non-copyable
        Publisher& operator=(const Publisher&) = delete; // non-copyable
        Publisher(Publisher&&) noexcept = default; // movable
        Publisher& operator=(Publisher&&) noexcept = default; // movable

        bool Init(const std::string &uri,
                  const std::string &client_id,
                  int keep_alive = 20);
        void Publish(const std::string &topic,
                     const std::string &payload,
                     int qos = 0);
        static Publisher& getInstance();
    private:
        friend class absl::NoDestructor<Publisher>;
        Publisher() = default; 
        MQTTClient client_{nullptr};
    };

} // namespace canmqtt::mqtt
