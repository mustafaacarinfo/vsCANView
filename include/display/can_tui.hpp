#pragma once
#include <string>
#include <vector>
#include <cstddef>

struct Row {
    std::string ts;   // 12:345
    std::string id;   // 0x98FEEF00
    std::string name; // AMB_FMS
    int         dlc;  // 8
    std::string sigs; // Ambient=25.2 …
};

class CanTui
{
public:
    CanTui()  { init(); }
    ~CanTui();

    void addRow(Row r);          // Frame -> tabloya satır ekle
    bool pollInput();            // Klavye okur | ESC/q = false
    void render(double cpu,double mem);

private:
    void init();
    void drawHeader(double cpu,double mem);
    void drawFooter();

    std::vector<Row> rows_;
    size_t           scroll_ = 0;    // PgUp/PgDn kaydırma
};
