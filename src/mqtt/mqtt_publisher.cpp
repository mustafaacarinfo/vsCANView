#include "mqtt/mqtt_publisher.hpp"
#include <iostream>

namespace canmqtt::mqtt
{
    Publisher& Publisher::getInstance()
    {
        static absl::NoDestructor<Publisher> instance;
        
        return *instance;
    }

    bool Publisher::Init(const std::string &uri,
                         const std::string &client_id,
                         int keep_alive)
    {
        MQTTClient_create(&client_, uri.c_str(), client_id.c_str(),
                          MQTTCLIENT_PERSISTENCE_NONE, nullptr);

        MQTTClient_connectOptions opts = MQTTClient_connectOptions_initializer;
        opts.keepAliveInterval = keep_alive;
        opts.cleansession = 1;

        /* TLS :
        MQTTClient_SSLOptions ssl_opts = MQTTClient_SSLOptions_initializer;
        ssl_opts.trustStore = "ca.crt";
        opts.ssl = &ssl_opts;
        */

        int rc = MQTTClient_connect(client_, &opts);
        if (rc != MQTTCLIENT_SUCCESS)
        {
            std::cerr << "MQTT connect failed, rc=" << rc << '\n';
            return false;
        }
        return true;
    }

    void Publisher::Publish(const std::string &topic,
                            const std::string &payload,
                            int qos)
    {
        MQTTClient_message msg = MQTTClient_message_initializer;
        msg.payload = const_cast<char *>(payload.data());
        msg.payloadlen = static_cast<int>(payload.size());
        msg.qos = qos;
        msg.retained = 0;

        MQTTClient_publishMessage(client_, topic.c_str(), &msg, nullptr);
    }

} // namespace canmqtt::mqtt
