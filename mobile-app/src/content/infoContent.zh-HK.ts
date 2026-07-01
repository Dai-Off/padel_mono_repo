import type { InfoScreenContent, InfoScreenId } from './infoContent.es';

export const INFO_SCREENS_ZH_HK: Record<InfoScreenId, InfoScreenContent> = {
  help: {
    title: '幫助',
    lastUpdated: '2026年5月27日',
    blocks: [
      {
        type: 'paragraph',
        text: '需要 WeMatch 協助？這裡有常見問題解答，以及如何聯絡支援團隊。',
      },
      { type: 'heading', text: '常見問題' },
      { type: 'heading', text: '預約及球場' },
      {
        type: 'list',
        items: [
          '在「球場」分頁選擇球會、日期及可用時段即可預約。',
          '已確認的預約會顯示在你的日曆。若付款未完成，需在限時內完成。',
          '取消政策因球會而異，確認前請細閱條款。',
        ],
      },
      { type: 'heading', text: '球局及水平' },
      {
        type: 'list',
        items: [
          '可加入公開球局或建立新球局並邀請球友。',
          '水平根據活動及評價計算；完成初始問卷可獲更準確的起點。',
          '球局取消時你會收到通知，並按付款方式處理退款（如適用）。',
        ],
      },
      { type: 'heading', text: '付款及錢包' },
      {
        type: 'list',
        items: [
          '信用卡付款透過 Stripe 安全處理。',
          '錢包儲存特定球會的餘額，不能跨球會轉移。',
          '如發現錯誤扣款，請聯絡支援並提供日期、球會及金額。',
        ],
      },
      { type: 'heading', text: '帳戶及登入' },
      {
        type: 'list',
        items: [
          '可在側邊選單編輯個人資料、電話及偏好。',
          '更改密碼：設定 → 安全。',
          '未收到重設密碼電郵？請檢查垃圾郵件或聯絡支援。',
        ],
      },
      { type: 'heading', text: '聯絡支援' },
      {
        type: 'paragraph',
        text: '我們處理技術問題、預約、付款及帳戶查詢。請提供註冊電郵，以及相關球會和日期。',
      },
      {
        type: 'contact',
        email: 'soporte@wematch.com',
        label: '發送電郵至支援',
      },
      {
        type: 'paragraph',
        text: '回覆時間（參考）：週一至週五 9:00–18:00（西班牙半島時間）。其餘時間我們會盡快處理。',
      },
    ],
  },
  'how-it-works': {
    title: 'WeMatch 如何運作',
    lastUpdated: '2026年5月27日',
    blocks: [
      {
        type: 'paragraph',
        text: 'WeMatch 將板式網球球友、球會、球局、課程及競賽集中於一個平台。以下為主要使用流程。',
      },
      { type: 'heading', text: '1. 建立球員檔案' },
      {
        type: 'paragraph',
        text: '以電郵註冊，完成個人資料及水平問卷。檔案越完整，球局及球伴推薦越準確。',
      },
      { type: 'heading', text: '2. 探索球會並預約球場' },
      {
        type: 'paragraph',
        text: '在「球場」查看附近球會、即時空檔並預約時段。部分球會可預約課程或私人球局。',
      },
      { type: 'heading', text: '3. 打球局' },
      {
        type: 'list',
        items: [
          '公開球局：按水平、日期及球會篩選並加入空位。',
          '建立球局：選擇球場、時間、目標水平並邀請球友。',
          '私人球局：僅受邀者可見，不會出現在公開列表。',
          '賽後可評價體驗，改善日後配對。',
        ],
      },
      { type: 'heading', text: '4. 課程及訓練' },
      {
        type: 'paragraph',
        text: '在「學院」報名合作球會的課程。訓練記錄見「你的活動 → 課程」。',
      },
      { type: 'heading', text: '5. 競賽' },
      {
        type: 'paragraph',
        text: '球會發布的錦標賽及聯賽可能需要報名及付款。報名前請細閱規則、日期及組別。',
      },
      { type: 'heading', text: '6. 付款及錢包' },
      {
        type: 'list',
        items: [
          '以信用卡安全支付預約、報名及費用。',
          '錢包累積特定球會的餘額（例如取消後的信用額）。',
          '在側邊選單「你的付款」管理付款方式。',
        ],
      },
      { type: 'heading', text: '7. 社群' },
      {
        type: 'paragraph',
        text: '訊息、群組及社交功能助你協調球局。可在設定調整通知。',
      },
      {
        type: 'paragraph',
        text: 'WeMatch 持續更新。如有建議，歡迎電郵支援——你的意見有助我們改善體驗。',
      },
      {
        type: 'contact',
        email: 'soporte@wematch.com',
        label: '聯絡支援',
      },
    ],
  },
  terms: {
    title: '使用條款',
    lastUpdated: '2026年5月27日',
    blocks: [
      {
        type: 'paragraph',
        text: '本使用條款規管你對 WeMatch 應用程式（「本 App」）的存取及使用。建立帳戶或使用本 App 即表示你接受這些條款。',
      },
      { type: 'heading', text: '1. 服務目的' },
      {
        type: 'paragraph',
        text: 'WeMatch 提供球場預約、球局管理、活動報名、付款及球友溝通。WeMatch 為技術中介；場地服務由各地球會提供。',
      },
      { type: 'heading', text: '2. 註冊及帳戶' },
      {
        type: 'list',
        items: [
          '你須成年或獲監護人授權。',
          '所提供的資料須真實並保持更新。',
          '你須保管登入資料，並對帳戶內的一切活動負責。',
          'WeMatch 可暫停違反條款或損害其他用戶的帳戶。',
        ],
      },
      { type: 'heading', text: '3. 預約及取消' },
      {
        type: 'paragraph',
        text: '每項預約受球會供應及取消政策約束，確認前會顯示。退款（如適用）按球會政策及付款方式處理。',
      },
      { type: 'heading', text: '4. 付款' },
      {
        type: 'paragraph',
        text: '付款由認證第三方（如 Stripe）處理。WeMatch 不儲存完整卡號。價格、稅項及費用於確認前顯示。',
      },
      { type: 'heading', text: '5. 用戶行為' },
      {
        type: 'list',
        items: [
          '合法、尊重他人並符合體育精神地使用本 App。',
          '不得騷擾、侮辱或歧視其他用戶。',
          '不得虛假預約、操縱評價或逃避付款。',
          '不得逆向工程、大量擷取或未授權的自動化使用。',
        ],
      },
      { type: 'heading', text: '6. 知識產權' },
      {
        type: 'paragraph',
        text: '本 App、設計、商標及內容屬 WeMatch 或其授權方所有。除本條款允許的個人使用外，不授予其他權利。',
      },
      { type: 'heading', text: '7. 責任限制' },
      {
        type: 'paragraph',
        text: 'WeMatch 不對球會設施內的受傷、財物損失或事件負責，亦不對非其控制範圍內的服務中斷負責。本 App 按「現狀」提供，在法律允許範圍內。',
      },
      { type: 'heading', text: '8. 修改' },
      {
        type: 'paragraph',
        text: '我們可更新本條款，並透過本 App 或電郵通知重要變更。繼續使用即表示接受新版本。',
      },
      { type: 'heading', text: '9. 適用法律' },
      {
        type: 'paragraph',
        text: '本條款受西班牙法律管轄。消費者爭議可尋求歐盟認可的庭外解決途徑。',
      },
      {
        type: 'contact',
        email: 'soporte@wematch.com',
        label: '使用條款查詢',
      },
    ],
  },
  privacy: {
    title: '私隱政策',
    lastUpdated: '2026年5月27日',
    blocks: [
      {
        type: 'paragraph',
        text: 'WeMatch 按歐盟 GDPR 及西班牙資料保護法處理你的個人資料。本政策說明我們收集什麼、用途及你的權利。',
      },
      { type: 'heading', text: '1. 資料控制者' },
      {
        type: 'paragraph',
        text: 'WeMatch 為你 WeMatch 帳戶相關資料的控制者。行使權利請電郵支援，主旨註明「資料保護」。',
      },
      { type: 'heading', text: '2. 我們收集的資料' },
      {
        type: 'list',
        items: [
          '身份：姓名、電郵、電話、頭像及用戶名。',
          '運動：水平、偏好、球局、課程及競賽記錄。',
          '交易：預約、付款、錢包餘額及交易識別（不含完整卡號）。',
          '技術：裝置識別、使用記錄、IP 及診斷資料。',
          '通訊：App 內訊息及通知偏好。',
        ],
      },
      { type: 'heading', text: '3. 目的及法律依據' },
      {
        type: 'list',
        items: [
          '提供服務（合約履行）：管理預約、球局、付款及帳戶。',
          '產品改善（合法利益）：匯總分析、安全及防欺詐。',
          '商業通訊（同意）：最新消息及推廣，可隨時撤回。',
          '法律義務：發票保存及回應主管機關。',
        ],
      },
      { type: 'heading', text: '4. 與第三方分享' },
      {
        type: 'paragraph',
        text: '我們僅與必要第三方分享資料：你預約或參與的球會、付款供應商（Stripe）、雲端基礎設施（Supabase）及電郵服務。我們不出售個人資料。',
      },
      { type: 'heading', text: '5. 保存期限' },
      {
        type: 'paragraph',
        text: '帳戶有效期間及法律要求的額外期限內保存資料。刪除請求後，除法律強制保存外，我們會封鎖或刪除資料。',
      },
      { type: 'heading', text: '6. 你的權利' },
      {
        type: 'list',
        items: [
          '查閱、更正及刪除你的資料。',
          '限制或反對特定處理。',
          '資料可攜權。',
          '撤回基於同意的處理。',
          '向西班牙資料保護局（www.aepd.es）投訴。',
        ],
      },
      { type: 'heading', text: '7. 安全' },
      {
        type: 'paragraph',
        text: '我們採取合理技術及組織措施：傳輸加密、存取控制、權限審計及安全儲存。請使用強密碼並勿分享登入。',
      },
      { type: 'heading', text: '8. 未成年人' },
      {
        type: 'paragraph',
        text: 'WeMatch 不針對 14 歲以下未成年人。如發現無合法依據收集的未成年人資料，我們將刪除。',
      },
      { type: 'heading', text: '9. 政策變更' },
      {
        type: 'paragraph',
        text: '當做法或法規變更時我們會更新本政策，並在文檔開頭標示最後修訂日期。',
      },
      {
        type: 'contact',
        email: 'soporte@wematch.com',
        label: '行使私隱權利',
      },
    ],
  },
};
