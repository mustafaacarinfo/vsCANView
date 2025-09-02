#!/usr/bin/env bash
set -euo pipefail

IFACE="${1:-vcan0}"
SA_HEX="${2:-00}"           # Source Address (hex, 00..FE)

# --- vcan setup (if not exists) ---
if ! ip link show "$IFACE" &>/dev/null; then
  sudo modprobe vcan
  sudo ip link add dev "$IFACE" type vcan
  sudo ip link set up "$IFACE"
  echo "[i] $IFACE prepared (vcan)."
fi

# --- helpers: little endian hex generation ---
u8()  { local v=$1; printf "%02X" $(( (v)      & 0xFF )); }
le16(){ local v=$1; printf "%02X%02X" $(( v      & 0xFF )) $(( (v>>8) & 0xFF )); }
le24(){ local v=$1; printf "%02X%02X%02X" $(( v      & 0xFF )) $(( (v>>8) & 0xFF )) $(( (v>>16) & 0xFF )); }
le32(){ local v=$1; printf "%02X%02X%02X%02X" $(( v      & 0xFF )) $(( (v>>8) & 0xFF )) $(( (v>>16) & 0xFF )) $(( (v>>24) & 0xFF )); }

# --- PGN -> 29-bit ID (priority=6 -> 0x18), for PDU2 formats ID = 0x18 | PGN | SA ---
ID(){ local PGN=$1; echo "18${PGN}${SA_HEX}"; }

# --- initial values (realistic, variable) ---
rpm=900                    # RPM
spd=0                      # km/h
coolant_c=80              # °C
oil_c=85                  # °C
exhaust_c=320             # °C
oil_kpa=300               # kPa
fuel_pct=75              # %
batt_v=27.8              # V
odo_raw=$((100000))      # Total distance raw units (0.125 km/bit) -> 12,500 km
map_kpa=120              # kPa (boost/MAP)
fuel_lph=12              # L/h
brk_pct=0                # % (brake pedal)
gps_lat=41.015137        # Istanbul latitude
gps_lon=28.979530        # Istanbul longitude
moving_north=true        # Direction flag for GPS simulation

# --- main loop ---
while true; do
  # 1) Engine Speed - SPN 190 @ PGN 61444 (EEC1), bytes 4-5, 0.125 rpm/bit
  rpm_raw=$(( rpm * 8 ))  # 0.125 rpm/bit => rpm*8
  eec1_data="FFFFFF$(le16 $rpm_raw)FFFF"
  cansend "$IFACE" "$(ID F004)#$eec1_data"

  # 2) Vehicle Speed - SPN 84 @ PGN 65265 (CCVS), bytes 2-3, 1/256 km/h/bit
  spd_raw=$(( spd * 256 ))      # Convert to 1/256 km/h/bit
  ccvs_data="FF$(le16 $spd_raw)FFFFFF"
  cansend "$IFACE" "$(ID FEF1)#$ccvs_data"

  # 3) Temperatures - PGN 65262 (ET1)
  # - Coolant Temp (SPN 110) @ byte 1, 1 °C/bit, offset -40
  # - Oil Temp (SPN 175) @ byte 3, 0.03125 °C/bit, offset -273
  ct_raw=$(( coolant_c + 40 ))
  ot_raw=$(( (oil_c + 273) * 32 ))  # Convert to 0.03125 °C/bit
  et1_data="$(u8 $ct_raw)FF$(u8 $ot_raw)FFFF"
  cansend "$IFACE" "$(ID FEEE)#$et1_data"

  # 4) Oil Pressure - SPN 100 @ PGN 65263 (EFL/P1), byte 4, 4 kPa/bit
  op_raw=$(( oil_kpa / 4 ))
  efl1_data="FFFF$(u8 $op_raw)FFFF"
  cansend "$IFACE" "$(ID FEEF)#$efl1_data"

  # 5) Fuel Level - SPN 96 @ PGN 65276 (DD/LFC), byte 1, 0.4 %/bit
  fl_raw=$(( fuel_pct * 10 / 4 ))   # % / 0.4 = %*2.5 -> for integer *10/4
  lfc_data="$(u8 $fl_raw)FFFFFFFF"
  cansend "$IFACE" "$(ID FEFC)#$lfc_data"

  # 6) Battery Voltage - SPN 168 @ PGN 65271 (VEP1), bytes 5-6, 0.05 V/bit
  bv_raw=$(printf "%.0f" "$(awk -v v="$batt_v" 'BEGIN{printf v/0.05}')" )
  vep1_data="FFFFFFFF$(le16 $bv_raw)"
  cansend "$IFACE" "$(ID FEF7)#$vep1_data"

  # 7) Total Vehicle Distance - SPN 245 @ PGN 65248 (VD), bytes 5-8, 0.125 km/bit
  odo_raw=$(( odo_raw + 2 ))  # +0.25 km per iteration
  vd_data="FFFFFFFF$(le32 $odo_raw)"
  cansend "$IFACE" "$(ID FEE0)#$vd_data"

  # 8) Intake Manifold Pressure - SPN 102 @ PGN 65270 (IC1), byte 2, 2 kPa/bit
  map_raw=$(( map_kpa / 2 ))
  ic1_data="FF$(u8 $map_raw)FFFFFF"
  cansend "$IFACE" "$(ID FEF6)#$ic1_data"

  # 9) Fuel Rate - SPN 183 @ PGN 65266 (LFE), bytes 1-2, 0.05 L/h/bit
  fr_raw=$(( fuel_lph * 20 ))
  lfe_data="$(le16 $fr_raw)FFFFFF"
  cansend "$IFACE" "$(ID FEF2)#$lfe_data"

  # 10) GPS Location - Custom PGN FE60
  # Pack lat/lon as 24-bit fixed point: 
  # - Integer part: upper 16 bits
  # - Fraction part: lower 8 bits (1/256 precision)
  gps_lat_raw=$(printf "%.0f" "$(awk -v v="$gps_lat" 'BEGIN{printf v*256}')")
  gps_lon_raw=$(printf "%.0f" "$(awk -v v="$gps_lon" 'BEGIN{printf v*256}')")
  gps_data="$(le24 $gps_lat_raw)$(le24 $gps_lon_raw)FF"
  cansend "$IFACE" "$(ID FE60)#$gps_data"

  # --- simulate value changes ---
  # RPM varies between 900-2000
  rpm=$(( rpm + 50 ))
  if (( rpm > 2000 )); then rpm=900; fi

  # Speed 0-90 km/h
  spd=$(( spd + 2 ))
  if (( spd > 90 )); then spd=0; fi

  # MAP pressure varies with RPM
  map_kpa=$(( 120 + (rpm - 900) / 10 ))

  # Fuel consumption varies with RPM/speed
  fuel_lph=$(( 12 + (rpm - 900) / 100 ))

  # Fuel level decreases
  if (( fuel_pct > 1 )); then 
    fuel_pct=$(( fuel_pct - 1 ))
  else 
    fuel_pct=75
  fi

  # GPS movement simulation - moving in a square pattern
  if [ "$moving_north" = true ]; then
    gps_lat=$(awk -v lat="$gps_lat" 'BEGIN{printf "%.6f\n", lat + 0.0001}')
    if (( $(awk -v lat="$gps_lat" 'BEGIN{print (lat > 41.025) ? 1 : 0}') )); then
      moving_north=false
    fi
  else
    gps_lat=$(awk -v lat="$gps_lat" 'BEGIN{printf "%.6f\n", lat - 0.0001}')
    if (( $(awk -v lat="$gps_lat" 'BEGIN{print (lat < 41.015) ? 1 : 0}') )); then
      moving_north=true
    fi
  fi
  gps_lon=$(awk -v lon="$gps_lon" 'BEGIN{printf "%.6f\n", lon + 0.0001}')

  # Temperature variations
  coolant_c=$(( coolant_c + (-1 + RANDOM % 3) ))  # +/- 1°C variation
  if (( coolant_c < 75 )); then coolant_c=75; fi
  if (( coolant_c > 95 )); then coolant_c=95; fi

  oil_c=$(( oil_c + (-1 + RANDOM % 3) ))          # +/- 1°C variation
  if (( oil_c < 80 )); then oil_c=80; fi
  if (( oil_c > 110 )); then oil_c=110; fi

  exhaust_c=$(( exhaust_c + (-5 + RANDOM % 11) ))  # +/- 5°C variation
  if (( exhaust_c < 300 )); then exhaust_c=300; fi
  if (( exhaust_c > 400 )); then exhaust_c=400; fi

  sleep 0.1  # 100ms delay between updates
done
