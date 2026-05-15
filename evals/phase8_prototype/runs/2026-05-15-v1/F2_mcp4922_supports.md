# F2_mcp4922_supports

**Edge type focus:** SUPPORTS

**Query:** What's the correct SPI configuration for driving the MCP4922 DAC from an STM32F407 on the Discovery board, and what specific gotchas should I plan for?

**Rationale:** Routes to the MCP4922/SPI cluster, which has dense SUPPORTS + ELABORATES edges, almost all with rich authored notes (e.g. 'Confirms the same complete SPI2 configuration — 16-bit frame, CPOL=0/CPHA=0, ...'). Default prompt typically lists facts from each note in isolation. Candidate prompt should use SUPPORTS / BUILDS_ON edges as evidence-aggregation signals — treating the supporting notes as reinforcing the configuration claims rather than as independent parallel notes.

---

## Default prompt output

## SPI Configuration for MCP4922 on STM32F407 Discovery

### Peripheral and Pin Selection

Use **SPI2 on PB13 (SCK) and PB15 (MOSI)**, with **PB12 as software-controlled CS** [Note 1]. SPI1 is ruled out because its default pins (PA5–PA7) are consumed by the onboard LIS3DSH accelerometer [Note 9]. PB12–PB15 route cleanly to the P1 expansion header with no onboard conflicts [Note 7].

**Schematic tracing gotcha:** When reading the DISC1 schematic (MB997E), don't mistake the STM32F103 ST-LINK controller's PB13/PB14 JTAG connections for the F407 target pins — always confirm which chip you're tracing [Note 7].

### Core SPI Settings

| Parameter | Value | Reason |
|---|---|---|
| Mode | CPOL=0, CPHA=0 (Mode 0) | MCP4922 samples on rising SCK edge [Note 6] |
| Data frame | 16-bit (DFF=1) | One complete command word per transaction [Note 3] |
| Bit order | MSB first | Required by MCP4922 command structure [Note 8] |
| Clock | ÷8 → ~2 MHz (APB1) | APB1 at 16 MHz pre-PLL; well within 20 MHz max [Note 4] |
| NSS | Software (SSM=1, SSI=1) | Explicit CS timing control [Note 2] |
| MISO | Unconnected | MCP4922 is write-only [Note 2] |

### Specific Gotchas

1. **Hardware NSS is unreliable here.** The STM32 hardware NSS can glitch or deassert between bytes, especially in 16-bit frame mode. Any unexpected CS glitch causes incorrect DAC output since the MCP4922 latches on CS rising edge [Note 5]. Set **SSM=1 and SSI=1 together** — SSI must accompany SSM or the peripheral misinterprets its internal state [Note 17].

2. **Write SPI_DR as `uint16_t`, not 32-bit.** When DFF=1, the data register must be written as a halfword. A 32-bit write will not behave correctly [Note 13]. Poll TXE before writing and BSY before deasserting CS [Note 12].

3. **Tie LDAC permanently to GND.** This causes the DAC output to update immediately on the CS rising edge, eliminating any need for a separate LDAC firmware toggle [Note 3] [Note 6].

4. **16-bit command word structure matters.** The 4 control bits precede the 12 data bits: channel A base word is `0x3000`, channel B is `0xB000`, then OR in your 12-bit value [Note 8]. Getting this wrong produces silent but incorrect output.

5. **Start at 2 MHz during bring-up.** This eliminates signal integrity as a debugging variable while you verify firmware correctness. Push the clock higher only after confirmed operation [Note 14].

---

## Candidate prompt output

## SPI Configuration for MCP4922 on STM32F407 DISC1

### Peripheral and Pin Selection

Use **SPI2 on PB13 (SCK) and PB15 (MOSI)**, with **PB12 as software-managed GPIO chip select** [Note 1, Note 7]. SPI1 is ruled out because its default pins PA5–PA7 are consumed by the onboard LIS3DSH accelerometer [Note 9]. Schematic tracing on the MB997E confirmed PB12–PB15 route cleanly to the P1 expansion header with no onboard conflicts [Note 7]. One specific trap: the STM32F103 ST-LINK controller also has pins labelled PB13/PB14 in the schematic — confirm you are tracing the F407 target's pins, not the ST-LINK's [Note 7].

MISO can be left unconnected; the MCP4922 is write-only [Note 2].

### Core SPI Register Configuration

| Parameter | Setting | Rationale |
|---|---|---|
| Mode | Master | — |
| CPOL/CPHA | 0/0 (Mode 0) | MCP4922 samples on rising edge, clock idles low [Note 6] |
| Data frame | 16-bit (DFF=1) | One complete command word per transaction [Note 3, Note 4] |
| Bit order | MSB first | Required by MCP4922 command word format [Note 8] |
| Baud rate | APB1 ÷8 → ~2 MHz | APB1 at 16 MHz pre-PLL; BR=010; well under the 20 MHz max [Note 4] |
| NSS | SSM=1, SSI=1 | Software CS mode; both bits required [Note 17] |

### CS and LDAC Handling

**Do not use hardware NSS.** The STM32 hardware NSS can deassert between bytes and its behaviour in 16-bit mode is unpredictable — any CS glitch causes an incorrect latch on the MCP4922, which updates output on the CS rising edge [Note 5, Note 6]. Set SSM=1 and SSI=1; drive PB12 low before transmission and high after [Note 3, Note 12].

**Tie LDAC permanently to GND.** This causes the DAC output to update immediately on the rising CS edge at the end of each transaction, eliminating any need for a separate LDAC firmware toggle [Note 6, Note 11].

### Transmit Sequence Gotchas

- **Write SPI_DR as `uint16_t`, not `uint32_t`.** When DFF=1, a 32-bit write to SPI_DR will not behave correctly [Note 13].
- Poll TXE before writing and BSY after to confirm the transaction is complete before raising CS [Note 12].
- Assert CS low → write 16-bit command → wait for BSY=0 → deassert CS high. The rising CS edge is the latch trigger [Note 3, Note 6].

### Command Word Construction

Each write is 16 bits: 4 config bits + 12 data bits, MSB first [Note 8]:
- Bit 15: channel select (0=A, 1=B)
- Bit 14: Vref buffer
- Bit 13: gain (/GA — 0=2×, 1=1×)
- Bit 12: output enable (/SHDN — 1=active)

For normal 1× gain, unbuffered, active output: base word is `0x3000` (channel A) or `0xB000` (channel B), then OR in your 12-bit value [Note 8, Note 15].

### Bring-Up Strategy

Start at 2 MHz (÷8) to eliminate signal integrity as a debugging variable [Note 14]. The MCP4922's 20 MHz ceiling means SPI2's lower maximum clock relative to SPI1 is irrelevant — there is headroom to increase speed later once correctness is confirmed [Note 1].

---

## Context assembled (identical across all prompts above)

```
[Note 1] SPI2 on PB13/PB15 is the correct peripheral choice for MCP4922 on DISC1 (permanent)
Tags: Capstone, MCP4922, STM32
For driving an MCP4922 DAC from an STM32F407 DISC1 board, SPI2 using PB13 (SCK) and PB15 (MOSI) is the appropriate selection. Schematic tracing confirmed that PB12–PB15 are not connected to any onboard DISC1 peripheral and are accessible via the P1 expansion header. SPI2's 42 MHz maximum clock is well above the MCP4922's 20 MHz limit, so the speed disadvantage relative to SPI1 is irrelevant in practice.
Connections: → ELABORATES Note 7 (Directly expands on the schematic-tracing process that confirmed PB12–PB15 are conflict-free and explains the common trap of confusing ST-LINK pins with F407 target pins.); → SUPPORTS Note 9 (Confirms the premise of the source note by establishing that SPI1's default pins are occupied by the onboard accelerometer, making SPI2 the necessary choice.); → SUPPORTS Note 10 (Provides the general methodology — mandatory schematic tracing before pin assignment — that underlies the source note's conclusion about SPI2 on PB13/PB15.); → SUPPORTS Note 6 (Establishes the MCP4922's 20 MHz SCK maximum, which is the key spec the source note cites to dismiss SPI2's lower clock ceiling as irrelevant in practice.)

---

[Note 2] STM32F407 SPI2 Configured for MCP4922 DAC Output (permanent)
The SPI2 peripheral on the STM32F407 is configured in master mode with a 16-bit data frame, CPOL=0, CPHA=0, MSB-first, and a ÷8 baud rate divisor (~2 MHz on APB1). These settings are chosen to match the MCP4922 DAC's requirements as specified in its datasheet. The chip select line (PB12) is managed manually as a GPIO output with software NSS mode (SSM=1) for clarity and reliability. MISO is left unconnected since the MCP4922 is a write-only device.

---

[Note 3] MCP4922 SPI configuration requires 16-bit frames with software CS and LDAC tied low (permanent)
Tags: Capstone, MCP4922
The MCP4922 dual DAC expects a 16-bit command word per transaction, so the STM32 SPI peripheral must be configured with DFF=1 for 16-bit data frames. Chip select is managed in software via GPIO rather than the hardware NSS pin, giving explicit control over the CS-low-before-clock and CS-high-after-16th-pulse timing that the MCP4922 requires. Tying LDAC permanently low means the DAC output updates immediately on the rising edge of CS, eliminating the need for a separate LDAC toggle in firmware. A conservative ÷8 clock divider yielding 2 MHz is appropriate for initial bring-up before pushing to higher rates.
Connections: → ELABORATES Note 4 (Provides the specific SPI Mode 0 rationale and APB1 clock math that explains why ÷8 yields 2 MHz, filling in detail behind the source's configuration choices.); → SUPPORTS Note 2 (Confirms the same complete SPI2 configuration — 16-bit frame, CPOL=0/CPHA=0, software NSS, 2 MHz — as a working setup for the MCP4922 on STM32F407.); → SUPPORTS Note 6 (Documents the MCP4922's SPI timing requirements (Mode 0, CS idle-high, LDAC-low latch behavior) that directly justify the configuration decisions in the source note.); → SUPPORTS Note 5 (Explains the specific hardware NSS failure modes that motivate the source's choice of software-managed CS over the STM32's hardware NSS pin.); → ELABORATES Note 11 (Zooms in on the LDAC-tied-low design decision, expanding on why this eliminates a separate firmware toggle and when it is appropriate.); → ELABORATES Note 12 (Details the STM32 register-level mechanics (SSM/SSI, TXE/BSY polling, DFF, uint16_t write) required to implement the configuration the source note describes.); → ELABORATES Note 13 (Addresses the critical halfword-write constraint that applies specifically when DFF=1 is set as the source recommends, and spells out the correct transmit sequence.)

---

[Note 4] Configuring SPI2 for the MCP4922 DAC on STM32 (permanent)
The MCP4922 uses SPI Mode 0 (CPOL=0, CPHA=0) and requires exactly one 16-bit word per transaction, making 16-bit mode (DFF=1) the correct choice — it avoids the complexity of holding CS low across two 8-bit writes. SPI2 sits on APB1, which runs at 16MHz before PLL configuration; a ÷8 baud divisor (BR=010) gives 2MHz, well within the MCP4922's 20MHz maximum. These settings — Mode 0, 16-bit frame, 2MHz clock, software CS — form the complete working configuration for driving the DAC.

---

[Note 5] STM32 Hardware NSS Has Quirks That Undermine Reliable CS Control (permanent)
The STM32 SPI peripheral's hardware NSS mode (SSM=0) can deassert chip select between bytes in certain configurations, and its behavior in 16-bit data frame mode is less predictable than in 8-bit mode. Because the CS state is implicit and driven by the peripheral rather than code, timing issues are harder to observe and debug during bring-up. For peripherals like the MCP4922 that require CS held low for an entire 16-bit transaction and latch output on the CS rising edge, any unexpected CS glitch will cause incorrect DAC output.

---

[Note 6] MCP4922 SPI timing requirements and operating mode (permanent)
The MCP4922 operates in SPI Mode 0: clock idles low (CPOL=0) and data is sampled on the rising edge of SCK (CPHA=0). CS idles high and must return high between transactions; maximum SCK frequency is 20 MHz. When LDAC is tied permanently to GND, the DAC output updates immediately on the rising edge of CS at the end of each transaction — no separate LDAC strobe is needed for single-channel real-time output.

---

[Note 7] STM32 SPI2 pin selection requires schematic tracing to avoid conflicts (permanent)
On the STM32F407 Discovery board (MB997E), SPI1's default pins (PA5–PA7) are consumed by the onboard LIS3DSH accelerometer, making SPI1 unavailable without remapping. SPI2 on PB12–PB15 routes cleanly to the P1 expansion header with no onboard peripheral conflicts. A common trap when reading the schematic is mistaking the STM32F103 ST-LINK controller's PB13/PB14 JTAG connections for the F407 target's pins — always confirm which chip's pins you are tracing. Software-managed GPIO on PB12 is used for chip select to maintain explicit control over CS timing.

---

[Note 8] MCP4922 16-bit command word structure and bit fields (permanent)
Every SPI write to the MCP4922 is exactly 16 bits: 4 configuration bits followed by 12 data bits, sent MSB first. Bit 15 selects the DAC channel (0=A, 1=B), bit 14 controls Vref buffering, bit 13 sets gain (/GA: 0=2×, 1=1×), and bit 12 enables the output (/SHDN: 1=active). For normal CV output at 1× gain, unbuffered, and active, bits 14–12 are always 0b011, giving a base word of 0x3000 for channel A or 0xB000 for channel B before OR-ing in the 12-bit data value.

---

[Note 9] SPI1 default pins conflict with DISC1 onboard accelerometer (permanent)
SPI1's default pins are consumed by the DISC1 onboard accelerometer, making them unavailable for external use.

---

[Note 10] Peripheral pin selection in bare-metal STM32 requires schematic tracing, not assumption (permanent)
Bare-metal STM32 development requires manual schematic tracing to avoid silent pin conflicts with onboard peripherals.

---

[Note 11] MCP4922 LDAC Tied Low Enables Immediate CV Output (permanent)
Tying MCP4922 LDAC low causes output to update immediately on CS rising edge, simplifying firmware.

---

[Note 12] STM32 SPI Register Configuration for Master-Mode Transmission (permanent)
STM32 SPI requires SSM=1/SSI=1 for manual CS control and a uint16_t write to SPI_DR in 16-bit mode.

---

[Note 13] SPI_DR Must Be Written as Halfword When DFF=1 on STM32 (permanent)
On STM32, SPI_DR must be written as uint16_t in 16-bit mode; a 32-bit write will not behave correctly.

---

[Note 14] Reduce bring-up SPI clock to eliminate signal integrity as a variable (permanent)
Tags: Capstone, Troubleshooting
A conservative SPI clock during bring-up isolates firmware correctness by eliminating signal integrity as a debugging variable.
Connections: → SUPPORTS Note 3 (The candidate independently endorses a ÷8 clock divider yielding 2MHz for initial bring-up before pushing to higher rates, corroborating the source's specific clock recommendation.); → ELABORATES Note 4 (The candidate specifies the exact BR[2:0]=010 divisor and 2MHz clock configuration for SPI2/MCP4922, providing the concrete implementation details that the source recommends as a conservative bring-up setting.)

---

[Note 15] MCP4922 command word builder in C for single-channel use (permanent)
Tags: MCP4922
A simple C function builds the MCP4922 16-bit SPI command from a channel selector and 12-bit data value.
Connections: → ELABORATES Note 8 (The source describes building a command word; this candidate specifies the exact bit-field layout (bits 15–12, base words 0x3000/0xB000) that the builder function implements.)

---

[Note 16] SPI Protocol Fundamentals: Signals, Clocking, and Chip Select (permanent)
Tags: Protocol, SPI
SPI uses four signals and four clock modes; CPOL/CPHA mismatch is the most common configuration error.
Connections: → ELABORATES Note 6 (The MCP4922's specific CPOL=0/CPHA=0 requirement and CS timing behavior is a concrete instantiation of the CPOL/CPHA mode mismatch problem the source identifies as the most common SPI configuration error.); → ELABORATES Note 5 (Explains how hardware NSS (the STM32 implementation of CS) can violate the CS-held-low-for-entire-transaction requirement that the source establishes as fundamental to SPI chip select behavior.)

---

[Note 17] SSM and SSI Must Both Be Set When Using Software CS on STM32 SPI (permanent)
Tags: Capstone, STM32
On STM32 SPI, SSM=1 disables hardware NSS and SSI=1 must accompany it to prevent internal misinterpretation.
Connections: → SUPPORTS Note 5 (Documents the failure modes of hardware NSS mode, providing concrete motivation for why both SSM and SSI must be set to achieve reliable software CS control.)
```
