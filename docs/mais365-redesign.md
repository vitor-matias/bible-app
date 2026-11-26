# +365 page redesign

The page of the +365 plan (`src/app/components/mais365/`): what it shows, why, and how
it adapts to each platform. One template and one component for the web and both apps;
the platforms differ in CSS only (`mais365.component.css` for the web,
`mais365.native.css` for the apps, as the pastoral index does).

## What a daily-plan page has to answer

1. **What do I read today?** The day's card leads: «Dia 12 · Hoje», the episode's length,
   its title set in the reading face (the one place the page borrows the Bible text's
   type), who leads it, and its readings as rows that open their chapters.
2. **What do I do first?** One filled button per card («Ouvir e ler», or «Continuar» /
   «Pausar» for the day being heard). «Ler sem áudio» and «Marcar como lido» are
   outlined. Before, all three were the same antiquewhite pill.
3. **How far am I?** A thin bar and «11 de 365 dias lidos» under the page's one line of
   introduction. It counts days of readings; introductions are not among the 365.
4. **Where is day N?** The list is cut into the plan's own periods (Criação do Mundo,
   Patriarcas, Egipto e Êxodo, ...), which the podcast's introductions already mark: each
   «Introdução a ...» opens a section named after it, with its count read («6/21»).
   The list opens at the next day to read: the days before it, all but the two just
   before, fold behind «Mostrar os N dias anteriores». (Period chips to jump to a
   section were dropped: most people follow the plan a day at a time.)
5. **What is in a day, without opening it?** Each row carries the day's readings in a line
   («Génesis 1–2 · Salmo 19»).
6. **What have I read, where am I?** Read days dim and carry a check; the next day to read
   has an accent edge and a bold number; the day being heard carries an equaliser mark.
   The floating «Dia N» pill still brings the next day back when it is scrolled away.
7. **Picking a day far down the list** now brings its card into view on one column (it used
   to change a card that was off screen).

The reflection card keeps its transport (⏮, ±15, play, speed, Terminar) and takes the
same accent.

## What was left out, on purpose

- **Streaks.** The plan is «at the reader's own pace» (today is the first day not read),
  and `mais365Done` keeps day numbers without dates. A streak would need dated storage and
  would turn a missed day into a loss, which fits neither the service nor a Bible app.
- **Resuming inside a day after the app closes.** The player keeps no position between
  launches; that is a player change, not a page one.
- **Collapsing periods read.** The back-to-next pill watches the next day's row, which
  must stay laid out.
- **Native panes** (a split view on iPad, a list-detail scaffold on Android). Both
  columns are one web view: a shell pane would need a second web view or the list drawn
  again natively from a contract of its own, to show what the CSS grid already shows,
  with the card first. An Android collapsing top app bar was not asked for.

## Colour

One accent with its pair, as page variables: `--accent` / `--on-accent`.

| | Light | Dark |
|---|---|---|
| Web | header brown `#543d27` / antiquewhite | antiquewhite / brown |
| Android | `--android-primary` / `--android-on-primary` (the bars' Material colours) | same tokens |
| iOS | text colour / background (the app has no accent colour) | same |

## Web

Hosted in the reader, under its header, following its text size (sizes are in `em`).
One column up to 760px; from there two, the day's card sticky on the left and the days
on the right (it was 960px, which left an 820px tablet with the phone's layout). The
period chips scroll sideways on a phone and wrap beside the card.

## Android (Material 3)

- **Top app bar:** the shell's, titled «+365», with its back arrow. Unchanged.
- **Card:** filled card, `surface-container-low`, 12dp corners, 16dp padding.
- **Buttons:** filled for the main action, outlined for the rest; the back-to-next pill
  is shaped as a small extended FAB (16dp corners, 48dp).
- **List:** list items of 56dp, 72dp with the second line, no dividers, text 16dp from
  the edge; subheaders in title-small; the selected item on `surface-container-high`
  with rounded corners.
- **Tablet (≥760dp):** two panes as on the web: the day's card leads (3fr, sticky), the
  days beside it (2fr, at least 300dp).

## iOS (HIG)

- **Bars:** the shell's Liquid Glass bars; no glass in content.
- **Large title:** «+365» at 34pt bold leads the page and scrolls away with the
  introduction, leaving the day's card under the bar; the bar's own title fades in as it
  goes (`TitledPageChrome.largeTitle`, see architecture.md). A phone on its side has the
  bar's title alone, as UIKit.
- **Background:** the system's grouped colours, as the search page and the index.
- **Card and list:** inset grouped: 26pt corners, white (`#1c1c1e` at night), hairline
  separators from the text's edge, rows of at least 44pt that highlight while pressed.
  Section headers in sentence case, footnote size, semibold.
- **Buttons:** capsules of 44pt; the main one is the text colour inverted.
- **iPad (≥760pt):** two panes as on the web: the day's card leads, the days beside it.

## Owner's decisions (26 Nov 2026)

- Progress counts the days published so far («x de N»), 365 once the year is out.
- The day's card leads everywhere, and always shows: most people never touch the list.
  No period chips; the list opens at the next day, the days before folded.
- Reading streaks: wanted («N dias seguidos», from the dates days are read on).
- Native shell work (an iOS large title; panes only if they keep the card first).
