// Supported enumerations from official Asbuilt 5.2 XSD.
// https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2/Asbuilt.xsd
// SHA-256: 7798e35194d102b5729dc7a7b0a2015111f9affea339576b9a9eb3cefb33cf70
// Deliberately limited to listed codes, excluding free-form other: extensions.
import { immutable } from '../photoSpatial.mjs';
export const ASBUILT_CODES = immutable({
  "horizontalMethod": [
    {
      "value": "21",
      "label": "Punkt beregnet ved aerotriangulering"
    },
    {
      "value": "19",
      "label": "Annet"
    },
    {
      "value": "79",
      "label": "Annet (spesifiseres i filhode)"
    },
    {
      "value": "69",
      "label": "Beregnet, uspesifisert hvordan"
    },
    {
      "value": "37",
      "label": "Målt med laserskanner plassert i kjøretøy"
    },
    {
      "value": "43",
      "label": "Geometri overført fra flybilde ved hjelp av manuell registrering på et digitaliseringsbord. Bildemedium er film"
    },
    {
      "value": "44",
      "label": "Geometri overført fra flybilde ved hjelp av manuell registrering på et digitaliseringsbord. Bildemedium er fotokopi"
    },
    {
      "value": "40",
      "label": "Geometri overført fra ortofoto eller flybilde ved hjelp av manuell registrering på et digitaliseringsbord, uspesifisert bildemedium"
    },
    {
      "value": "41",
      "label": "Geometri overført fra ortofoto ved hjelp av manuell registrering på et digitaliseringsbord. Bildemedium er film"
    },
    {
      "value": "42",
      "label": "Geometri overført fra ortofoto ved hjelp av manuell registrering på et digitaliseringsbord. Bildemedium er fotokopi"
    },
    {
      "value": "50",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord, medium uspesifisert"
    },
    {
      "value": "51",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord. Kartmedium er blyantoriginal"
    },
    {
      "value": "55",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord. Kartmedium er papirkopi"
    },
    {
      "value": "52",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord. Kartmedium er rissefolie"
    },
    {
      "value": "53",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord. Kartmedium er transparent folie av god kvalitet, samkopi"
    },
    {
      "value": "54",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på et digitaliseringsbord. Kartmedium er transparent folie av mindre god kvalitet, samkopi"
    },
    {
      "value": "47",
      "label": "47"
    },
    {
      "value": "45",
      "label": "Geometri overført fra ortofoto ved hjelp av manuell registrering på skjerm"
    },
    {
      "value": "46",
      "label": "Geometri overført fra satellittbilde ved hjelp av manuell registrering på skjerm"
    },
    {
      "value": "56",
      "label": "Geometri overført fra kart ved hjelp av manuell registrering på skjerm, medium skannet kart (raster), samkopi"
    },
    {
      "value": "48",
      "label": "48"
    },
    {
      "value": "77",
      "label": "Punkt fastsatt ut fra et grunnlag (kart, bilde), f.eks ved partenes enighet ved en oppmålingsforretning"
    },
    {
      "value": "78",
      "label": "Geometri fastsatt ved dom, lov, traktat eller kongelig resolusjon"
    },
    {
      "value": "36",
      "label": "Målt med laserskanner fra fly"
    },
    {
      "value": "80",
      "label": "Digitalisert ut fra frihåndstegning. Frihåndstegning er basert på svært grovt grunnlag eller ikke noe grunnlag"
    },
    {
      "value": "81",
      "label": "Digitalisert fra krokering på kart, dvs grovt skissert på kart"
    },
    {
      "value": "82",
      "label": "Digitalisert ut fra frihåndstegning (direkte på skjerm). Frihåndstegning er basert på svært grovt grunnlag eller ikke noe grunnlag"
    },
    {
      "value": "60",
      "label": "Genererte data, interpolasjonsmetode. Ikke nærmere spesifisert"
    },
    {
      "value": "61",
      "label": "Genererte data, interpolasjonsmetode, fra terrengmodell"
    },
    {
      "value": "62",
      "label": "Genererte data, interpolasjonsmetode, vektet middel"
    },
    {
      "value": "63",
      "label": "Genererte data: Sirkelgeometri, korridor eller annen geometri generert ut fra f.eks et punkt eller en linje (f.eks midtlinje veg)"
    },
    {
      "value": "64",
      "label": "Genererte data: Generalisering"
    },
    {
      "value": "66",
      "label": "Genererte data: Sammenknytningspunkt (f.eks mellom ulike kartlegginger), randpunkt (f.eks mellom ulike kilder til kart)"
    },
    {
      "value": "65",
      "label": "Genererte data: Sentralpunkt"
    },
    {
      "value": "97",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO). Fasemåling float-løsning"
    },
    {
      "value": "96",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO).: Fasemåling RTK (realtids kinematisk måling)"
    },
    {
      "value": "94",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO): Fasemåling andre metoder."
    },
    {
      "value": "93",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO): Fasemåling statisk måling."
    },
    {
      "value": "92",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO): Kodemåling, enkle målinger."
    },
    {
      "value": "91",
      "label": "Innmålt med satellittbaserte systemer for navigasjon og posisjonering med global dekning (f.eks GPS, GLONASS, GALILEO): Kodemåling, relative målinger."
    },
    {
      "value": "95",
      "label": "Kombinasjon av GPS/Treghet"
    },
    {
      "value": "67",
      "label": "Koordinater hentet fra GAB, forløperen til registerdelen av matrikkelen"
    },
    {
      "value": "68",
      "label": "Koordinater hentet fra JREG, jordregisteret"
    },
    {
      "value": "38",
      "label": "brukes for objekter som er stedfestet med lineær referanse, enten disse leveres med stedfesting kun som lineære referanser, eller med koordinatgeometri avledet fra lineære referanser"
    },
    {
      "value": "30",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner, uspesifisert kartmedium"
    },
    {
      "value": "31",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner. Kartmedium er blyantoriginal"
    },
    {
      "value": "35",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner. Kartmedium er papirkopi."
    },
    {
      "value": "32",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner. Kartmedium er rissefolie"
    },
    {
      "value": "33",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner. Kartmedium er transparent folie av god kvalitet."
    },
    {
      "value": "34",
      "label": "Geometri overført fra kart maskinelt ved hjelp av skanner. Kartmedium er transparent folie av mindre god kvalitet"
    },
    {
      "value": "70",
      "label": "Spesielle metoder, uspesifisert"
    },
    {
      "value": "73",
      "label": "Spesielle metoder: Målt med målehjul"
    },
    {
      "value": "74",
      "label": "Spesielle metoder: Målt med stigningsmåler"
    },
    {
      "value": "71",
      "label": "Spesielle metoder: Målt med stikkstang"
    },
    {
      "value": "72",
      "label": "Spesielle metoder: Målt med waterstang"
    },
    {
      "value": "20",
      "label": "Målt i stereoinstrument, uspesifisert instrument"
    },
    {
      "value": "22",
      "label": "Målt i stereoinstrument, analytisk plotter"
    },
    {
      "value": "23",
      "label": "Målt i stereoinstrument, autograf, analogt instrument"
    },
    {
      "value": "24",
      "label": "Målt i stereoinstrument, digitalt instrument"
    },
    {
      "value": "18",
      "label": "Tatt fra plan eller godkjent tiltak"
    },
    {
      "value": "14",
      "label": "Målt i terrenget, ortogonalmetoden"
    },
    {
      "value": "12",
      "label": "Målt i terrenget med teodolitt og elektronisk avstandsmåler"
    },
    {
      "value": "13",
      "label": "Målt i terrenget med teodolitt og målebånd"
    },
    {
      "value": "11",
      "label": "Målt i terrenget med totalstasjon"
    },
    {
      "value": "10",
      "label": "Målt i terrenget , uspesifisert metode/måleinstrument"
    },
    {
      "value": "90",
      "label": "Treghetsstedfesting"
    },
    {
      "value": "99",
      "label": "Målemetode er ukjent"
    },
    {
      "value": "15",
      "label": "Punkt beregnet på bakgrunn av måling mot andre punkter, slik som to avstander eller avstand og retning"
    },
    {
      "value": "49",
      "label": "Vektorisering fra laserdata, brukes også der vektoriseringen støttes av ortofoto"
    }
  ],
  "verticalMethod": [
    {
      "value": "21",
      "label": "21"
    },
    {
      "value": "19",
      "label": "19"
    },
    {
      "value": "79",
      "label": "79"
    },
    {
      "value": "69",
      "label": "69"
    },
    {
      "value": "78",
      "label": "78"
    },
    {
      "value": "36",
      "label": "36"
    },
    {
      "value": "60",
      "label": "60"
    },
    {
      "value": "61",
      "label": "61"
    },
    {
      "value": "62",
      "label": "62"
    },
    {
      "value": "63",
      "label": "63"
    },
    {
      "value": "64",
      "label": "64"
    },
    {
      "value": "66",
      "label": "66"
    },
    {
      "value": "96",
      "label": "96"
    },
    {
      "value": "94",
      "label": "94"
    },
    {
      "value": "93",
      "label": "93"
    },
    {
      "value": "92",
      "label": "92"
    },
    {
      "value": "91",
      "label": "91"
    },
    {
      "value": "95",
      "label": "95"
    },
    {
      "value": "67",
      "label": "67"
    },
    {
      "value": "68",
      "label": "68"
    },
    {
      "value": "15",
      "label": "15"
    },
    {
      "value": "70",
      "label": "70"
    },
    {
      "value": "74",
      "label": "74"
    },
    {
      "value": "20",
      "label": "20"
    },
    {
      "value": "22",
      "label": "22"
    },
    {
      "value": "23",
      "label": "23"
    },
    {
      "value": "24",
      "label": "24"
    },
    {
      "value": "18",
      "label": "18"
    },
    {
      "value": "14",
      "label": "14"
    },
    {
      "value": "12",
      "label": "12"
    },
    {
      "value": "13",
      "label": "13"
    },
    {
      "value": "11",
      "label": "11"
    },
    {
      "value": "10",
      "label": "10"
    },
    {
      "value": "90",
      "label": "90"
    },
    {
      "value": "99",
      "label": "99"
    }
  ],
  "surveyReason": [
    {
      "value": "fjernet",
      "label": "Eksisterende objekt som ble stedfestet før det fysisk ble fjernet"
    },
    {
      "value": "flyttetDelvis",
      "label": "Eksisterende objekt som har blitt flyttet, men hvor traseens tverrsnitt har kun delvis blitt avdekket. Stedfestingen refererer til avdekket objekt."
    },
    {
      "value": "flyttetHelt",
      "label": "Eksisterende objekt som har blitt flyttet, og hvor objektets tverrsnitt i sin helhet har blitt avdekket"
    },
    {
      "value": "nytt",
      "label": "Nybygd stedfestet objekt"
    },
    {
      "value": "påvist",
      "label": "Eksisterende objekt som ble stedfestet basert på påvisning, og hvor objektet ikke ble avdekket"
    },
    {
      "value": "uendret",
      "label": "Eksisterende helt eller delvis avdekket objekt med tidligere manglende eller dårlig stedfesting før ny stedfestet ble foretatt"
    }
  ],
  "surveyConditions": [
    {
      "value": "åpenGrøft",
      "label": "Grøften er åpen og stedfesting foregår direkte på synlig objekt."
    },
    {
      "value": "åpenKumStasjon",
      "label": "Stedfesting foregår direkte på synlig objekt i kum eller i nettstasjon."
    },
    {
      "value": "delvisLukketGrøft",
      "label": "Grøften er delvis fylt igjen og stedfesting foregår på omfylt masse, hvor z-verdien til objektet er beregnet i forhold til objektets faktiske beliggenhet."
    },
    {
      "value": "iBorehull",
      "label": "Objektet ligger i borehull. Stedfesting foretatt i borehull."
    },
    {
      "value": "iKanal",
      "label": "Objektet ligger i kanal. Stedfesting foretatt i kanal."
    },
    {
      "value": "ikkeStedfestet",
      "label": "Stedfesting av objektet er ikke utført, med unntak av start- og slutt node (punkt). Eksempel: Borehull med liten diameter, utilgjengelig del av objekt."
    },
    {
      "value": "iKulvert",
      "label": "Objektet ligger i kulvert. Stedfesting foretatt i kulvert."
    },
    {
      "value": "iTunnel",
      "label": "Objektet ligger i tunnel. Stedfesting foretatt i tunnel."
    },
    {
      "value": "iVann",
      "label": "Stedfesting på/langs objektet i sjø/vassdrag."
    },
    {
      "value": "iVarerør",
      "label": "Objektet ligger i varerør."
    },
    {
      "value": "lukketGrøft",
      "label": "Grøften er fylt igjen og stedfesting foregår på bakkenivå, hvor z-verdien til objektet er beregnet ved hjelp av oppgitt grøftedybde."
    },
    {
      "value": "overflateVann",
      "label": "Stedfesting på vannoverflaten, hvor z-verdien til objektet er beregnet i forhold til objektets beliggenhet på/under bunnen, evt. i vannsøylen."
    },
    {
      "value": "påvist",
      "label": "Stedfesting på bakgrunn av påvist ledningsforløp, hvor z-verdien til objektet er beregnet i forhold til objektets antatte beliggenhet."
    },
    {
      "value": "posisjonFraKumStasjon",
      "label": "Posisjon (koordinater) fra kummen/nettstasjonen som objektet er plassert i."
    }
  ]
});
