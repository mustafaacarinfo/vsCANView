#include "display/can_tui.hpp"
#include <ncurses.h>
#include <locale.h>

/* ─────────────– init ─────────────– */
void CanTui::init()
{
    setlocale(LC_ALL, "");
    initscr();
    cbreak(); noecho();
    keypad(stdscr, TRUE);
    nodelay(stdscr, TRUE);

    start_color();  use_default_colors();
    init_pair(1, COLOR_WHITE,  COLOR_BLUE);   // header/footer
    init_pair(2, COLOR_YELLOW, -1);           // RawID
    init_pair(3, COLOR_CYAN,   -1);           // Name
    init_pair(4, COLOR_WHITE,  -1);           // default text
    bkgd(COLOR_PAIR(4));
}

CanTui::~CanTui() { endwin(); }

/* ─────────────– Header ───────────── */
void CanTui::drawHeader(double cpu,double mem)
{
    attron(COLOR_PAIR(1));
    mvprintw(0,0,
      " CAN-Fusion Monitor | CPU %5.1f%% | MEM %6.1f MB | Frames %zu ",
      cpu, mem, rows_.size());
    clrtoeol();
    attroff(COLOR_PAIR(1));
}

/* ─────────────– Footer ───────────── */
void CanTui::drawFooter()
{
    attron(COLOR_PAIR(1));
    mvprintw(LINES-1,0,
    "PgUp/PgDn : Scrol   F9 : Stop   ESC/q : Exit()");
    clrtoeol();
    attroff(COLOR_PAIR(1));
}

/* ─────────────– addRow ───────────── */
void CanTui::addRow(Row r)
{
    rows_.push_back(std::move(r));
    if (rows_.size() > 10000) rows_.erase(rows_.begin());
}

/* ─────────────– pollInput ────────── */
bool CanTui::pollInput()
{
    int ch = getch();
    int page = LINES-4;
    switch(ch){
        case KEY_NPAGE: if(scroll_+page<rows_.size()) scroll_+=page; break;
        case KEY_PPAGE: scroll_ = (scroll_>page)? scroll_-page:0;   break;
        case 'q': case 27: return false;
    }
    return true;
}

/* ─────────────– render ───────────── */
/* ─────────────– render ───────────── */
/* ─────────────– render ───────────── */
void CanTui::render(double cpu, double mem)
{
    erase();
    drawHeader(cpu, mem);

    const int first_y     = 3;                 // veri satırlarının başladığı yer
    const int dlc_col     = 41;                // DLC yazacağı sütun
    const int sig_col     = 46;                // Signals sütunu
    const int sig_width   = COLS - sig_col - 1;

    /* Başlık satırı */
    mvprintw(2,0," TS(s)    RawID      Name                 DLC  Signals");
    hline('-', COLS);

    /* UTF-8 → ASCII dönüştürücü (° -> deg, … -> ...) */
    auto to_ascii = [](const std::string& s) {
        std::string o;
        for (size_t i = 0; i < s.size(); ++i) {
            unsigned char c = s[i];
            if (c == 0xC2 && i+1 < s.size() && (unsigned char)s[i+1] == 0xB0) {
                o += "deg"; ++i;
            } else if (c == 0xE2 && i+2 < s.size() &&
                       (unsigned char)s[i+1]==0x80 && (unsigned char)s[i+2]==0xA6) {
                o += "..."; i+=2;
            } else if (c < 0x80) o += c;
            else                o += '?';
        }
        return o;
    };

    /* Kaydırma hesabı */
    size_t visible = LINES - first_y - 1;
    size_t start   = scroll_
        ? scroll_
        : (rows_.size() > visible ? rows_.size() - visible : 0);

    int y = first_y;
    for (size_t i = start; i < rows_.size() && y < LINES-1; ++i) {
        const Row& r = rows_[i];
        std::string ascii = to_ascii(r.sigs);

        size_t pos = 0;  bool first = true;
        while (pos < ascii.size() && y < LINES-1) {
            std::string chunk = ascii.substr(pos, sig_width);
            pos += chunk.size();

            if (first) {
                mvprintw(y,0," %-9.9s", r.ts.c_str());
                attron(COLOR_PAIR(2)); mvprintw(y,10,"%-10s", r.id.c_str()); attroff(COLOR_PAIR(2));
                attron(COLOR_PAIR(3)); mvprintw(y,21,"%-20s", r.name.c_str()); attroff(COLOR_PAIR(3));

                mvprintw(y, dlc_col,"%2d", r.dlc);   // DLC tam hizada
            }
            mvprintw(y, sig_col, "%-*s", sig_width, chunk.c_str());
            ++y; first = false;
        }
    }
    drawFooter();
    refresh();
}


