export type Locale = 'es' | 'zh-HK';

export interface TranslationKeys {
    // Header
    header: {
        clubName: string;
        online: string;
        close: string;
        languageLabel: string;
    };

    // Toolbar
    toolbar: {
        yesterday: string;
        yesterdayShort?: string;
        today: string;
        todayShort?: string;
        tomorrow: string;
        tomorrowShort?: string;
        dayAfterTomorrow: string;
        dayAfterTomorrowShort?: string;
        zoom: string;
        print: string;
        fullViewTitle: string;
        reservationsOf: string;
        dateLabel: string;
        prevDay: string;
        nextDay: string;
        courtsTab: string;
        waitlistTab: string;
    };

    // Metrics Bar
    metrics: {
        occupancy: string;
        reservationsToday: string;
        newClients: string;
        revenueToday: string;
    };

    // Navigation (Single Court View)
    navigation: {
        previous: string;
        next: string;
        singleView: string;
        backToGrid: string;
    };

    // Grid
    grid: {
        dropRejected: string;
        courtPrefix: string;
        virtualCourt: string;
    };

    // BadPractice Modal
    badPractice: {
        title: string;
        subtitle: string;
        deadGapDetected: string;
        deadGapDescription: string; // uses {minutes}, {startTime}, {endTime}, {courtName}
        suggestion: string;
        suggestedTime: string;
        optimizationRule: string;
        optimizationRuleText: string;
        moveToTime: string; // uses {time}
        keepAnyway: string;
        moveEarlierSuggestion: string; // uses {time}
        moveLaterSuggestion: string; // uses {time}
        alignSuggestion: string; // uses {time}
    };

    // FreeSlot Modal
    freeSlot: {
        disabled: string;
        available: string;
        newAction: string;
        startTime: string;
        court: string;
        administration: string;
        enableSlot: string;
        createReservation: string;
        newStandardReservation: string;
        createMatch: string;
        addToTournament: string;
        blockCourt: string;
    };

    // Reservation Modal
    reservation: {
        options: string; // uses {title}
        schedule: string;
        court: string;
        management: string;
        viewDetails: string;
        edit: string;
        players: string;
        results: string;
        noShow: string;
        modify: string;
        validate: string;
        changeDate: string;
        addHalfHour: string;
        recalculatePrice: string;
        cancellations: string;
        withoutCharges: string;
        withCharges: string;
        refund: string;
        others: string;
        printInfo: string;
        total: string;
        paid: string;
        pending: string;
        payTPV: string;
        quickPay: string;
        addExtra: string;
        reservationFallback: string;
    };

    // Data labels: translates player names, match types, court names shown on cards
    dataLabels: Record<string, string>;

    // Status display labels (for showing translated status to the user)
    statusLabels: {
        pagado: string;
        torneoReservado: string;
        torneoPagado: string;
        reservaInternetPagado: string;
        s7ReservasReservado: string;
        reservaValleChino: string;
        reservaPuntaChino: string;
        disponible: string;
        tiempoPasado: string;
    };
}
