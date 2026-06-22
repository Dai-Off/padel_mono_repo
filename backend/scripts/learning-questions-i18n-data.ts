// Traducciones (zh-HK tradicional, zh-CN simplificado, en) de los campos de
// TEXTO de las preguntas de lección diaria. Hechas manualmente por Claude.
// El orden de options/steps/pairs/options-de-puzzle coincide con el content
// base (es) para que la clave de respuesta siga siendo válida.
// Términos técnicos de pádel (bandeja, víbora) se mantienen tal cual.

// id -> { [locale]: { ...campos de texto } }. Los locales presentes son los
// idiomas DISTINTOS del base de esa pregunta (el base vive en content + content_locale).
export type QTranslations = Record<string, Record<string, any>>;

// Preguntas cuyo content base NO está en español. El resto se asume 'es'.
// Las nuevas preguntas importadas en inglés irán aquí con 'en'.
export const CONTENT_LOCALE: Record<string, string> = {
  '3f781417-0c7d-4afa-a9f9-dc95027b18cb': 'en',
  'ef0a8dc5-ecd8-4896-9222-ff4e5ea3b4eb': 'en',
};

export const TRANSLATIONS: QTranslations = {
  // multi_select
  '23c4a339-312c-48cd-9613-2c2b3e465647': {
    'zh-HK': { question: '以下哪些情況在發球時屬於違例？', options: ['在腰部以上擊球', '踩到線', '擊球時加旋轉', '在發球線前讓球落地'], explanation: '規則要求發球時必須在腰部以下擊球，並且不可踩線或越過發球線。加旋轉是合法的，球在擊球前可以在你方發球區內任何位置落地。' },
    'zh-CN': { question: '以下哪些情况在发球时属于违例？', options: ['在腰部以上击球', '踩到线', '击球时加旋转', '在发球线前让球落地'], explanation: '规则要求发球时必须在腰部以下击球，并且不可踩线或越过发球线。加旋转是合法的，球在击球前可以在你方发球区内任何位置落地。' },
    en: { question: 'Which of these are illegal on the serve?', options: ['Hitting the ball above the waist', 'Stepping on the line', 'Hitting with spin', 'Bouncing the ball in front of the line'], explanation: 'The rules require you to hit the ball below the waist and without stepping on or past the service line. Adding spin is legal, and the ball may bounce anywhere in your service box before the hit.' },
  },
  // match_columns
  '0ee036cb-174d-4e30-a9f2-12282f175d4b': {
    'zh-HK': { question: '將每個擊球與其最常見的錯誤配對', pairs: [{ left: '短高球', right: '擊球未完整跟隨到底' }, { left: 'bandeja 打到玻璃', right: '手肘太低' }, { left: '殺球掛網', right: '擊球點太靠前' }, { left: '球在牆上彈太多', right: '平擊且太用力' }], explanation: '每個高空擊球的錯誤都有具體的生物力學成因。找出成因是糾正的第一步：重點不是「打好一點」，而是理解動作的哪個環節出問題。' },
    'zh-CN': { question: '将每个击球与其最常见的错误配对', pairs: [{ left: '短高球', right: '击球未完整跟随到底' }, { left: 'bandeja 打到玻璃', right: '手肘太低' }, { left: '杀球挂网', right: '击球点太靠前' }, { left: '球在墙上弹太多', right: '平击且太用力' }], explanation: '每个高空击球的错误都有具体的生物力学成因。找出成因是纠正的第一步：重点不是“打好一点”，而是理解动作的哪个环节出问题。' },
    en: { question: 'Match each shot with its most common mistake', pairs: [{ left: 'Short lob', right: 'Not following through to the end' }, { left: 'Bandeja into the glass', right: 'Elbow too low' }, { left: 'Smash into the net', right: 'Contact point too far forward' }, { left: 'Too much rebound off the wall', right: 'Flat and powerful hit' }], explanation: "Every mistake in the aerial game has a specific biomechanical cause. Identifying it is the first step to fixing it: it's not about 'hitting better' but understanding which part of the movement fails." },
  },
  // test_classic
  '477bb0d6-5f7b-4fc5-a4a2-f542eb5d395a': {
    'zh-HK': { question: '執行正手截擊時，手腕的正確姿勢是？', options: ['手腕放鬆以製造旋轉', '手腕穩固並鎖緊', '手腕向下彎曲', '手腕向上翻'], explanation: '放鬆的手腕會令擊球力量失控傳遞。鎖緊手腕能令手臂與球拍變成一根剛性的槓桿，為擊球帶來方向性與穩定性。' },
    'zh-CN': { question: '执行正手截击时，手腕的正确姿势是？', options: ['手腕放松以制造旋转', '手腕稳固并锁紧', '手腕向下弯曲', '手腕向上翻'], explanation: '放松的手腕会让击球力量失控传递。锁紧手腕能让手臂与球拍变成一根刚性的杠杆，为击球带来方向性与稳定性。' },
    en: { question: 'What is the correct wrist position when hitting a forehand volley?', options: ['Loose wrist to add spin', 'Firm and locked wrist', 'Wrist flexed downward', 'Wrist turned upward'], explanation: 'A loose wrist transfers the energy of the shot in an uncontrolled way. Locking it turns the arm and racket into a single rigid lever, giving the shot direction and consistency.' },
  },
  // order_sequence
  '37b43167-8a93-46ca-a814-9460ac9acbfa': {
    'zh-HK': { question: '排列執行 bandeja 的正確步驟', steps: ['轉體並高位準備', '橫向移動', '在頭部高度擊球', '回防球網'], explanation: 'bandeja 是一個由腳步建立的擊球。每個動作階段都為下一個做準備——打亂順序是失去擊球控制最常見的原因。' },
    'zh-CN': { question: '排列执行 bandeja 的正确步骤', steps: ['转体并高位准备', '横向移动', '在头部高度击球', '回防球网'], explanation: 'bandeja 是一个由脚步建立的击球。每个动作阶段都为下一个做准备——打乱顺序是失去击球控制最常见的原因。' },
    en: { question: 'Put the steps to perform a bandeja in the correct order', steps: ['Body turn and high preparation', 'Lateral movement', 'Contact at head height', 'Recover to the net'], explanation: 'The bandeja is a shot built from the feet up. Each phase of the movement sets up the next — skipping the order is the most common cause of losing control of the shot.' },
  },
  // true_false
  '84d7b562-1650-467f-a8cf-f9311b5e2b2d': {
    'zh-HK': { statement: '截擊時，採用長引拍是正確的。', explanation: '截擊是一個短而緊湊的動作。過長的準備會導致在錯誤的擊球點擊球。' },
    'zh-CN': { statement: '截击时，采用长引拍是正确的。', explanation: '截击是一个短而紧凑的动作。过长的准备会导致在错误的击球点击球。' },
    en: { statement: 'In the volley, it is correct to use a long backswing.', explanation: 'The volley is a short, compact movement. Overly long preparations lead to hitting the ball at the wrong contact point.' },
  },
  // test_classic
  '7211ac2d-19b2-4a81-bc74-66df9eff66cd': {
    'zh-HK': { question: '這個 bandeja 的主要錯誤是？', options: ['正面對球', '擊球點太高', '沒有為球加旋轉', '擊球點太低'], explanation: 'bandeja 需要完整的轉肩來正確蓄力。正面對球會失去這個槓桿，迫使你只靠手臂補償，因而失去力量與控制。' },
    'zh-CN': { question: '这个 bandeja 的主要错误是？', options: ['正面对球', '击球点太高', '没有为球加旋转', '击球点太低'], explanation: 'bandeja 需要完整的转肩来正确蓄力。正面对球会失去这个杠杆，迫使你只靠手臂补偿，因而失去力量与控制。' },
    en: { question: 'What is the main mistake in this bandeja?', options: ['Facing the ball head-on', 'Contact point too high', 'No spin on the ball', 'Contact point too low'], explanation: 'The bandeja requires a full shoulder turn to load the shot properly. Facing the ball head-on removes that lever and forces you to compensate with the arm, losing power and control.' },
  },
  // order_sequence
  '606390af-3cf6-4d32-9ee8-9049a3b64dc2': {
    'zh-HK': { question: '排列執行正手截擊的正確步驟', steps: ['判讀球的飛行路線', '轉肩並高位準備球拍', '用對側腳向前踏出並擊球', '回防至中央位置'], explanation: '截擊在擊球之前就已決勝負。判讀、轉肩和向前踏步才是把球送到你想要位置的關鍵——手臂只是完成最後的工作。' },
    'zh-CN': { question: '排列执行正手截击的正确步骤', steps: ['判读球的飞行路线', '转肩并高位准备球拍', '用对侧脚向前踏出并击球', '回防至中央位置'], explanation: '截击在击球之前就已决胜负。判读、转肩和向前踏步才是把球送到你想要位置的关键——手臂只是完成最后的工作。' },
    en: { question: 'Put the steps to perform a forehand volley in the correct order', steps: ["Read the ball's trajectory", 'Shoulder turn and high racket preparation', 'Step forward with the opposite foot and hit the ball', 'Recover to the central position'], explanation: 'The volley is won before the hit. Reading, the turn and the step forward are what put the ball where you want — the arm just finishes the job.' },
  },
  // match_columns
  '0c917131-4277-499d-b1e1-2ef03bab55aa': {
    'zh-HK': { question: '將每個擊球與其描述配對', pairs: [{ left: 'Bandeja', right: '帶切球旋轉的防守型高空擊球' }, { left: 'Víbora', right: '帶側上旋的進攻型高空擊球' }, { left: '平面殺球', right: '無旋轉的直接高空擊球，最大力量' }, { left: '高球', right: '越過網前對手的高弧球' }], explanation: '每種高空擊球都有不同的力學原理與目的。認得它的名稱與功能，是在球分中快速作出戰術決定的第一步。' },
    'zh-CN': { question: '将每个击球与其描述配对', pairs: [{ left: 'Bandeja', right: '带切球旋转的防守型高空击球' }, { left: 'Víbora', right: '带侧上旋的进攻型高空击球' }, { left: '平面杀球', right: '无旋转的直接高空击球，最大力量' }, { left: '高球', right: '越过网前对手的高弧球' }], explanation: '每种高空击球都有不同的力学原理与目的。认得它的名称与功能，是在球分中快速作出战术决定的第一步。' },
    en: { question: 'Match each shot with its description', pairs: [{ left: 'Bandeja', right: 'Defensive aerial shot with slice spin' }, { left: 'Víbora', right: 'Aggressive aerial shot with lateral topspin' }, { left: 'Flat smash', right: 'Direct aerial shot without spin, maximum power' }, { left: 'Lob', right: 'High shot to get past opponents at the net' }], explanation: 'Each aerial shot has different mechanics and a different purpose. Recognizing its name and function is the first step to making quick tactical decisions during the point.' },
  },
  // true_false
  'b12d2d1e-4d4e-4873-8ecb-13b32f427e5a': {
    'zh-HK': { statement: '在整個球分中保持膝蓋微曲，能讓你對方向變化反應得更快。', explanation: '半蹲姿勢降低重心，縮短反應時間。' },
    'zh-CN': { statement: '在整个球分中保持膝盖微曲，能让你对方向变化反应得更快。', explanation: '半蹲姿势降低重心，缩短反应时间。' },
    en: { statement: 'Keeping your knees slightly bent throughout the point lets you react faster to changes of direction.', explanation: 'The semi-flexed stance lowers your center of gravity and reduces reaction time.' },
  },
  // test_classic
  'a2f50db8-5081-4236-9aaa-8340189828c9': {
    'zh-HK': { question: '這個截擊的主要錯誤是？', options: ['轉肩不足', '引拍太長', '擊球旋轉不足', '擊球點太靠後'], explanation: '截擊時手臂應該做短而緊湊的動作。過長的引拍會把擊球點推向後方，降低控制力，並令面對快球時反應變慢。' },
    'zh-CN': { question: '这个截击的主要错误是？', options: ['转肩不足', '引拍太长', '击球旋转不足', '击球点太靠后'], explanation: '截击时手臂应该做短而紧凑的动作。过长的引拍会把击球点推向后方，降低控制力，并让面对快球时反应变慢。' },
    en: { question: 'What is the main mistake in this volley?', options: ['Too little shoulder turn', 'Backswing too long', 'Hitting with too little spin', 'Contact point too far back'], explanation: 'In the volley the arm should make a short, compact movement. A long backswing pushes the contact point back, reduces control and slows your reaction to fast balls.' },
  },
  // test_classic (sin explanation a partir de aquí salvo puzzles)
  '03242711-0596-4da6-ab77-8a1f97189abd': {
    'zh-HK': { question: '擊球時主要產生加速的是身體哪個部位？', options: ['手肘', '背部', '肩膀', '手腕'] },
    'zh-CN': { question: '击球时主要产生加速的是身体哪个部位？', options: ['手肘', '背部', '肩膀', '手腕'] },
    en: { question: 'Which part of the body mainly generates acceleration in a shot?', options: ['Elbow', 'Back', 'Shoulder', 'Wrist'] },
  },
  '82ded5de-b674-45ae-bf68-984fe5979f17': {
    'zh-HK': { question: '如果你總是手臂僵硬、不跟隨擊球，會怎樣？', options: ['力量更大', '控制更差、執行更糟', '控制更好', '沒有任何改變'] },
    'zh-CN': { question: '如果你总是手臂僵硬、不跟随击球，会怎样？', options: ['力量更大', '控制更差、执行更糟', '控制更好', '没有任何改变'] },
    en: { question: 'What happens if you always hit with a stiff arm without following through?', options: ['More power', 'Less control and worse execution', 'More control', 'Nothing changes'] },
  },
  'b76daea5-8009-4bce-b0d1-ef76e1f4fadc': {
    'zh-HK': { question: '對手在網前，你在底線，最佳選擇是？', options: ['大力擊球', '我不知道', '用高球越過他們', '輕輕擊球'] },
    'zh-CN': { question: '对手在网前，你在底线，最佳选择是？', options: ['大力击球', '我不知道', '用高球越过他们', '轻轻击球'] },
    en: { question: "Your opponents are at the net and you're at the back, what's the best option?", options: ['Hit hard', "I don't know", 'Lob to get past them', 'Hit softly'] },
  },
  '9cc570e6-ffcd-4ca3-b046-a56064967232': {
    'zh-HK': { question: '如果球還未完全越過球網進入你的場區，你可以擊球嗎？', options: ['可以', '不可以，必須等球到你這一邊', '只有殺球時可以', '可以，但只在你贏得該分時'] },
    'zh-CN': { question: '如果球还未完全越过球网进入你的场区，你可以击球吗？', options: ['可以', '不可以，必须等球到你这一边', '只有杀球时可以', '可以，但只在你赢得该分时'] },
    en: { question: 'Can you hit the ball before it has completely crossed the net into your side?', options: ['Yes', 'No, you must wait until it crosses to your side', 'Only on smashes', 'Yes, but only if you win the point'] },
  },
  '9a1b2d61-68b2-41ac-9b63-7e13a38d97d8': {
    'zh-HK': { question: '球分進行中，球碰到網柱仍算有效嗎？', options: ['只在發球時', '是，永遠有效', '不可以', '可以，只要正確進入對方場區'] },
    'zh-CN': { question: '球分进行中，球碰到网柱仍算有效吗？', options: ['只在发球时', '是，永远有效', '不可以', '可以，只要正确进入对方场区'] },
    en: { question: 'Can the ball touch the net post during the point and still be valid?', options: ['Only on the serve', 'Yes, always', 'No', "Yes, if it correctly passes to the opponent's side"] },
  },
  '120990e3-f182-4d13-8f8a-a82da8c1ce42': {
    'zh-HK': { question: '在大多數擊球中，理想的擊球點應該在哪裡？', options: ['非常貼近身體', '身體前方', '身體後方', '任何高度都可以'] },
    'zh-CN': { question: '在大多数击球中，理想的击球点应该在哪里？', options: ['非常贴近身体', '身体前方', '身体后方', '任何高度都可以'] },
    en: { question: 'Where should the ideal contact with the ball happen in most shots?', options: ['Very close to the body', 'In front of the body', 'Behind the body', 'At any height'] },
  },
  'eaf47aae-721d-4500-b532-5cc327f5a28d': {
    'zh-HK': { question: '你在網前，接到一個難處理的球（又低又快）：', options: ['擋擊', '大力擊球', '打切球', '打向鐵網方向'] },
    'zh-CN': { question: '你在网前，接到一个难处理的球（又低又快）：', options: ['挡击', '大力击球', '打切球', '打向铁网方向'] },
    en: { question: "You're at the net and receive an awkward ball (low and fast):", options: ['Block it', 'Hit hard', 'Play it with slice', 'Play toward the fence'] },
  },
  '3e121cc2-5667-49d6-81a0-adb498a74115': {
    'zh-HK': { question: 'bandeja 與 víbora 的主要分別是？', options: ['擊球高度', '擊球力量', '擊球意圖', '擊球控制'] },
    'zh-CN': { question: 'bandeja 与 víbora 的主要区别是？', options: ['击球高度', '击球力量', '击球意图', '击球控制'] },
    en: { question: 'What is the main difference between a bandeja and a víbora?', options: ['The contact height', 'The power of the shot', 'The intention of the shot', 'The control of the shot'] },
  },
  '957c2692-308b-4af1-9ad4-aeeb1a885cbb': {
    'zh-HK': { question: '擊球收尾動作的主要作用是？', options: ['提供力量', '為擊球提供控制與份量', '避免調整失誤', '我不知道'] },
    'zh-CN': { question: '击球收尾动作的主要作用是？', options: ['提供力量', '为击球提供控制与分量', '避免调整失误', '我不知道'] },
    en: { question: 'What is the main function of the follow-through?', options: ['To give power', 'To give control and weight to the shot', 'To avoid adjustment errors', "I don't know"] },
  },
  'b4f897b5-ce14-444e-873a-52636fe1fc46': {
    'zh-HK': { question: '一般而言，如果引拍過長會怎樣？', options: ['擊球更有力', '擊球更準確', '失去時間與擊球質素', '沒有影響'] },
    'zh-CN': { question: '一般而言，如果引拍过长会怎样？', options: ['击球更有力', '击球更准确', '失去时间与击球质量', '没有影响'] },
    en: { question: 'What generally happens if you take the backswing too long?', options: ['You hit with more power', 'You hit more accurately', 'You lose time and quality of contact', 'It has no effect'] },
  },
  // multi_select
  '570ae1fc-07c6-4e39-adeb-f1a5443fa005': {
    'zh-HK': { question: '一個執行良好的進攻型 víbora，關鍵要素有哪些？', options: ['無旋轉的平擊', '盡可能大力擊球', '運用側向切球旋轉', '在眼睛高度、身體前方擊球'] },
    'zh-CN': { question: '一个执行良好的进攻型 víbora，关键要素有哪些？', options: ['无旋转的平击', '尽可能大力击球', '运用侧向切球旋转', '在眼睛高度、身体前方击球'] },
    en: { question: 'In a well-executed offensive víbora, which elements are key?', options: ['Flat hit without spin', 'Hitting as hard as possible', 'Using lateral slice spin', 'Contact at eye height and in front of the body'] },
  },
  '92d69f04-0111-44d5-9a0d-03a0b0155f17': {
    'zh-HK': { question: '你發現對手在比賽中改變了打法，你會怎樣做？', options: ['加快節奏', '徹底改變策略', '調整你的策略', '維持原有策略'] },
    'zh-CN': { question: '你发现对手在比赛中改变了打法，你会怎样做？', options: ['加快节奏', '彻底改变策略', '调整你的策略', '维持原有策略'] },
    en: { question: 'You notice an opponent changing their pattern of play during the match. What would you do?', options: ['Increase the pace', 'Change your strategy radically', 'Adapt your strategy', 'Keep your strategy'] },
  },
  '0bceb440-bcdf-4d22-b3db-29d1878ea9a9': {
    'zh-HK': { question: '球在你的場區落地後，緊接著在你擊球前幾乎難以察覺地第二次輕擦地面：', options: ['自動失分（兩跳）', '重打該分', '若你擊球夠快則有效', '球分繼續'] },
    'zh-CN': { question: '球在你的场区落地后，紧接着在你击球前几乎难以察觉地第二次轻擦地面：', options: ['自动失分（两跳）', '重打该分', '若你击球够快则有效', '球分继续'] },
    en: { question: 'A ball bounces in your court and, right after, barely grazes the ground a second time almost imperceptibly before you hit it:', options: ['Point lost automatically (double bounce)', 'Replay the point', 'Valid point if you hit quickly', 'The point continues'] },
  },
  '98f1a9f8-0e1f-4255-bbe8-0b460ab5e34e': {
    'zh-HK': { question: '對手殺球後，你碰到球，並為了不失平衡而把球拍撐在對手場區的地面上，但沒有碰到球網：', options: ['有效，因為你沒有碰到球網', '失分，因為你干擾了對手的下一拍', '球分繼續，因為你沒有鬆開球拍', '失分，因為你不能碰到對手場區的任何部分'] },
    'zh-CN': { question: '对手杀球后，你碰到球，并为了不失平衡而把球拍撑在对手场区的地面上，但没有碰到球网：', options: ['有效，因为你没有碰到球网', '失分，因为你干扰了对手的下一拍', '球分继续，因为你没有松开球拍', '失分，因为你不能碰到对手场区的任何部分'] },
    en: { question: "After your opponent's smash, you touch the ball and end up resting your racket on the opponent's court to keep your balance without touching the net:", options: ["It's valid because you didn't touch the net", "You lose the point because you interfere with your opponent's next shot", "The point continues because you didn't drop the racket", "You lose the point because you can't touch any part of your opponent's court"] },
  },
  'bbe916f0-6d5e-4f3f-879e-d395686e738c': {
    'zh-HK': { question: '你在網前時對手快速攻你身體，最佳選擇是？', options: ['擋深球', '擋球並讓它落在底線附近', '我不知道', '擋短球'] },
    'zh-CN': { question: '你在网前时对手快速攻你身体，最佳选择是？', options: ['挡深球', '挡球并让它落在底线附近', '我不知道', '挡短球'] },
    en: { question: "They hit fast at your body while you're at the net. What's the best option?", options: ['Block it deep', 'Block aiming for it to land near the baseline', "I don't know", 'Block it short'] },
  },
  '85c1f6b8-f804-40ac-845e-901d84a33d18': {
    'zh-HK': { question: '這個發球的主要錯誤是？', options: ['擊球點太低', '引拍太長', '彈球時雙腳位置不正確', '缺乏轉肩'] },
    'zh-CN': { question: '这个发球的主要错误是？', options: ['击球点太低', '引拍太长', '弹球时双脚位置不正确', '缺乏转肩'] },
    en: { question: 'What is the main mistake in this serve?', options: ['Contact too low', 'Backswing too long', 'Feet poorly placed when bouncing the ball', 'Lack of shoulder turn'] },
  },
  'b385a441-4fd5-41fa-bf3d-63c8fe81f1b8': {
    'zh-HK': { question: '在基本正手擊球中，擊球瞬間拍面應該怎樣？', options: ['完全打開', '完全關閉', '向後翻', '略為打開或中性'] },
    'zh-CN': { question: '在基本正手击球中，击球瞬间拍面应该怎样？', options: ['完全打开', '完全关闭', '向后翻', '略为打开或中性'] },
    en: { question: 'In a basic forehand, how should the racket face be at contact?', options: ['Fully open', 'Fully closed', 'Turned backward', 'Slightly open or neutral'] },
  },
  // true_false (sin explanation)
  '80e2a1a6-e471-4e1c-baa2-fd835565863e': {
    'zh-HK': { statement: '這個發球有效嗎？' },
    'zh-CN': { statement: '这个发球有效吗？' },
    en: { statement: 'Is this serve valid?' },
  },
  'abe7394e-0000-4872-a3c4-6b4aaf8806da': {
    'zh-HK': { question: '如果在球分進行中，球從你口袋掉出來：', options: ['你失分', '重打該分，但只限第一次', '視乎當時是誰在進攻', '你贏得該分'] },
    'zh-CN': { question: '如果在球分进行中，球从你口袋掉出来：', options: ['你失分', '重打该分，但只限第一次', '视乎当时是谁在进攻', '你赢得该分'] },
    en: { question: 'If a ball falls out of your pocket during a point:', options: ['You lose the point', 'Replay the point, but only the first time', 'It depends on who was attacking at that moment', 'You win the point'] },
  },
  '9f7d7175-5cba-45e2-af4f-91f535bd9f9f': {
    'zh-HK': { question: '如果球員擊球時球拍從手中飛脫：', options: ['有效', '視乎裁判的判斷', '視乎擊球時是否仍握緊球拍', '無效，因為不能鬆開球拍'] },
    'zh-CN': { question: '如果球员击球时球拍从手中飞脱：', options: ['有效', '视乎裁判的判断', '视乎击球时是否仍握紧球拍', '无效，因为不能松开球拍'] },
    en: { question: 'If a player hits the ball and the racket flies out of their hand:', options: ["It's good", "It depends on a referee's opinion", 'It depends on whether the racket was held when the ball was struck', "It's no good because you can't let go of the racket"] },
  },
  'f017b476-1681-4fde-938f-30bc135dc8cc': {
    'zh-HK': { question: '在底線擊球方面，職業球員的關鍵差異是什麼？', options: ['穩定性', '方向變化', '旋轉', '力量'] },
    'zh-CN': { question: '在底线击球方面，职业球员的关键差异是什么？', options: ['稳定性', '方向变化', '旋转', '力量'] },
    en: { question: 'What sets a professional player apart in baseline shots?', options: ['Consistency', 'Placement', 'Spin', 'Power'] },
  },
  'cc9474c4-c436-4f65-87e2-6a0a2451bb26': {
    'zh-HK': { question: '哪個技術因素對球的深度影響最大？', options: ['施加的力量', '擊球高度', '擊球瞬間的拍面角度', '擊球的準備'] },
    'zh-CN': { question: '哪个技术因素对球的深度影响最大？', options: ['施加的力量', '击球高度', '击球瞬间的拍面角度', '击球的准备'] },
    en: { question: 'Which technical factor most influences the depth of the ball?', options: ['The power applied', 'The contact height', 'The angle of the racket face at contact', 'The preparation of the shot'] },
  },
  '938f3412-f93c-42f6-ba51-2f05145ef688': {
    'zh-HK': { question: '如果對方球員在球分進行中故意做動作或手勢來干擾：', options: ['受干擾的一方得分', '球分繼續', '視乎裁判的決定', '重打該分'] },
    'zh-CN': { question: '如果对方球员在球分进行中故意做动作或手势来干扰：', options: ['受干扰的一方得分', '球分继续', '视乎裁判的决定', '重打该分'] },
    en: { question: 'If an opposing player makes a gesture or movement to intentionally distract during the point:', options: ['Point to the player affected by the interference', 'The point continues', "It depends on a referee's decision", 'Replay the point'] },
  },
  '9093ad4f-5746-4015-9be1-6f5fbf6cdb65': {
    'zh-HK': { question: '如果球在球分進行中破裂：', options: ['打破球的一方得分', '對方一隊得分', '重打該分（let）', '球分繼續'] },
    'zh-CN': { question: '如果球在球分进行中破裂：', options: ['打破球的一方得分', '对方一队得分', '重打该分（let）', '球分继续'] },
    en: { question: 'If a ball breaks during the point:', options: ['Point to the player who broke the ball', 'Point to the opposing pair', 'Replay the point (let)', 'The point continues'] },
  },
  '64876ad4-c4f7-4949-8c2d-17715de39170': {
    'zh-HK': { question: '球在對方場區落地，剛好碰到地面與牆的交界處：', options: ['視乎聲音', '永遠無效', '永遠有效', '有疑問時重打'] },
    'zh-CN': { question: '球在对方场区落地，刚好碰到地面与墙的交界处：', options: ['视乎声音', '永远无效', '永远有效', '有疑问时重打'] },
    en: { question: 'The ball bounces in the opponent’s court and hits right at the joint between floor and wall:', options: ['It depends on the sound', "It's always out", "It's always good", 'Replay if in doubt'] },
  },
  'acf0c183-095a-46ee-b753-c052e19dec27': {
    'zh-HK': { question: '面對一個底線穩固的對手，你如何製造他的失誤？', options: ['大力而精準地擊球', '總是打同一個位置', '透過上下網轉換製造猶豫', '變化高度、節奏與方向'] },
    'zh-CN': { question: '面对一个底线稳固的对手，你如何制造他的失误？', options: ['大力而精准地击球', '总是打同一个位置', '通过上下网转换制造犹豫', '变化高度、节奏与方向'] },
    en: { question: 'How do you force errors from a solid opponent at the back?', options: ['Hitting hard and accurately', 'Always playing to the same spot', 'Making transitions to create doubt', 'Varying height, pace and direction'] },
  },
  '853ff401-fdba-4757-a533-aad02fa8466f': {
    'zh-HK': { question: '在網前的截擊對攻中，誰較有機會贏得該分？', options: ['我不知道', '反應較快的一方', '最先尋找角度的一方', '最先施壓的一方'] },
    'zh-CN': { question: '在网前的截击对攻中，谁较有机会赢得该分？', options: ['我不知道', '反应较快的一方', '最先寻找角度的一方', '最先施压的一方'] },
    en: { question: 'In a volley exchange at the net, who has the better chance of winning the point?', options: ["I don't know", 'The one with faster reflexes', 'The first to look for an angle', 'The first to apply pressure'] },
  },
  'efdfd281-8632-46b8-856d-db6600c264ba': {
    'zh-HK': { question: '如果球在落地前碰到你的身體……', options: ['球分繼續', '對方得分', '重打', '算我方有效，因為不能故意瞄準身體攻擊'] },
    'zh-CN': { question: '如果球在落地前碰到你的身体……', options: ['球分继续', '对方得分', '重打', '算我方有效，因为不能故意瞄准身体攻击'] },
    en: { question: 'If the ball touches your body before bouncing…', options: ['The point continues', 'Point for the opponent', 'Replay', "It's my point because you can't deliberately aim at the body"] },
  },
  // true_false (sin explanation)
  '811e06a6-c76a-4660-830f-1ad289772e0d': {
    'zh-HK': { statement: '球分結束後你可以碰到球網。' },
    'zh-CN': { statement: '球分结束后你可以碰到球网。' },
    en: { statement: 'You may touch the net after the point is over.' },
  },
  // order_sequence (sin explanation)
  '90bdb477-f997-40f7-95d2-315356309de4': {
    'zh-HK': { question: '將進攻時的重要性由高至低排序：', steps: ['守住網前', '製造壓力', '尋找致勝球'] },
    'zh-CN': { question: '将进攻时的重要性由高至低排序：', steps: ['守住网前', '制造压力', '寻找致胜球'] },
    en: { question: 'Order from most to least important in attack:', steps: ['Hold the net', 'Build pressure', 'Look for the winning shot'] },
  },
  '648f27ce-14ec-41d7-8050-259abfcfd925': {
    'zh-HK': { question: '在勢均力敵的一分中，最佳決定是？', options: ['保持相持直至製造出優勢', '總是攻同一名球員', '攻平行線的球員', '冒險搶攻取得優勢'] },
    'zh-CN': { question: '在势均力敌的一分中，最佳决定是？', options: ['保持相持直至制造出优势', '总是攻同一名球员', '攻平行线的球员', '冒险抢攻取得优势'] },
    en: { question: 'In a balanced point, what’s the best decision?', options: ['Keep the rally going until you build an advantage', 'Always play to the same player', 'Play to the player down the line', 'Take a risk to gain the advantage'] },
  },
  '3571b012-5657-4dfc-9b21-5a561b5c0bfb': {
    'zh-HK': { question: '你在網前，隊友在底線防守，你應該怎樣做？', options: ['無論如何都守在網前', '退到半場', '後退協助防守', '視乎來球的速度'] },
    'zh-CN': { question: '你在网前，队友在底线防守，你应该怎样做？', options: ['无论如何都守在网前', '退到半场', '后退协助防守', '视乎来球的速度'] },
    en: { question: "You're at the net and your partner is defending at the back. What should you do?", options: ['Stay at the net no matter what', 'Drop back to mid-court', 'Retreat to help on defense', 'It depends on the speed of the incoming ball'] },
  },
  '78aa9bc3-bad3-4e49-84f4-5520bfbc361a': {
    'zh-HK': { question: '球可以在發球區落地後、對手擊球前碰到牆嗎？', options: ['重打', '我不知道', '失分', '可以，有效並且球分繼續'] },
    'zh-CN': { question: '球可以在发球区落地后、对手击球前碰到墙吗？', options: ['重打', '我不知道', '失分', '可以，有效并且球分继续'] },
    en: { question: 'Can the ball bounce in the service box and then touch the wall before the opponent hits it?', options: ['Replay', "I don't know", 'Point lost', 'Yes, it’s valid and the point continues'] },
  },
  'ab0d23ae-32dc-4ccc-835f-96da9344e9cb': {
    'zh-HK': { question: '如果球在任何情況下碰到界線……', options: ['無效', '只在發球時有效', '有效（好球）', '視乎落地後有沒有碰牆'] },
    'zh-CN': { question: '如果球在任何情况下碰到界线……', options: ['无效', '只在发球时有效', '有效（好球）', '视乎落地后有没有碰墙'] },
    en: { question: 'If the ball touches the line on any play…', options: ["It's out", 'Only on the serve', "It's good (valid)", 'It depends on whether it touches the wall after the bounce'] },
  },
  '3fc1ecd6-88e8-4b35-8171-caf4c197ad41': {
    'zh-HK': { question: '球分進行中，如果球碰到球網後落在對方場區：', options: ['對方得分', '球分停止', '有效，球分繼續', '重打'] },
    'zh-CN': { question: '球分进行中，如果球碰到球网后落在对方场区：', options: ['对方得分', '球分停止', '有效，球分继续', '重打'] },
    en: { question: 'During a point, if the ball touches the net and then bounces in the opponent’s court:', options: ['Point for the opponent', 'The point stops', "It's valid and the point continues", 'Replay'] },
  },
  'eda7a4cc-14c1-40d4-8b2e-20668eb27cfb': {
    'zh-HK': { question: '球分進行中，如果你的球拍破裂而球仍在比賽中：', options: ['只要你能把球回過去，便可繼續打該分', '重打該分', '球分自動停止', '自動失分'] },
    'zh-CN': { question: '球分进行中，如果你的球拍破裂而球仍在比赛中：', options: ['只要你能把球回过去，便可继续打该分', '重打该分', '球分自动停止', '自动失分'] },
    en: { question: 'During a point, if your racket breaks and the ball is still in play:', options: ['You can keep playing the point if you can return the ball', 'Replay the point', 'The point stops automatically', 'You lose the point automatically'] },
  },
  // multi_select
  '4368b6cf-fd88-422e-9fb1-cb831ee3cddc': {
    'zh-HK': { question: '一個好的殺球，關鍵要素有哪些？（選出正確的）', options: ['運用雙腿', '身體協調', '正手東方式握拍', '反手東方式握拍'] },
    'zh-CN': { question: '一个好的杀球，关键要素有哪些？（选出正确的）', options: ['运用双腿', '身体协调', '正手东方式握拍', '反手东方式握拍'] },
    en: { question: 'Which elements are key to a good smash? (select the correct ones)', options: ['Use of the legs', 'Body coordination', 'Eastern forehand grip', 'Eastern backhand grip'] },
  },
  '9a1c1fdc-ac45-4b0a-a8fc-4fa007e9f383': {
    'zh-HK': { question: '在基本對拉中，開始時最重要的是？', options: ['我不知道', '大力擊球', '快速贏得該分', '有控制地讓球保持在比賽中'] },
    'zh-CN': { question: '在基本对拉中，开始时最重要的是？', options: ['我不知道', '大力击球', '快速赢得该分', '有控制地让球保持在比赛中'] },
    en: { question: 'In a basic rally, what matters most at the start?', options: ["I don't know", 'Hit hard', 'Win the point quickly', 'Keep the ball in play with control'] },
  },
  'e576e23e-a873-4083-9e60-f5d6f5577a38': {
    'zh-HK': { question: '在球分進行中（非發球），球碰到球網仍可有效嗎？', options: ['可以，只要過到對面', '只在防守時', '不可以，要重打', '只在進攻時'] },
    'zh-CN': { question: '在球分进行中（非发球），球碰到球网仍可有效吗？', options: ['可以，只要过到对面', '只在防守时', '不可以，要重打', '只在进攻时'] },
    en: { question: 'Can the ball touch the net during a point (not the serve) and still be valid?', options: ['Yes, if it goes to the other side', 'Only on defense', 'No, the point is replayed', 'Only on attack'] },
  },
  'ffb50e27-57f4-4a51-9068-8ebf069d0c92': {
    'zh-HK': { question: '如果你打下牆球時球經常飛向玻璃，最可能的錯誤是？', options: ['擊球前轉體不足', '擊球太遲', '握拍不正確', '擊球太早'] },
    'zh-CN': { question: '如果你打下墙球时球经常飞向玻璃，最可能的错误是？', options: ['击球前转体不足', '击球太迟', '握拍不正确', '击球太早'] },
    en: { question: 'If on the off-the-wall shot the ball regularly goes into the glass, what’s the most likely mistake?', options: ['Not enough body turn before contact', 'Contact too late', 'Incorrect grip', 'Contact too early'] },
  },
  // order_sequence (sin explanation, 6 pasos)
  '7a80cde7-928a-4072-94f1-159d0b427350': {
    'zh-HK': { question: '把截擊的各部分排成最正確的順序：', steps: ['分裂步', '髖部與肩膀轉動', '短而靠前的引拍', '在身體前方擊球＋對側腳踏步', '收尾', '回復位置'] },
    'zh-CN': { question: '把截击的各部分排成最正确的顺序：', steps: ['分裂步', '髋部与肩膀转动', '短而靠前的引拍', '在身体前方击球＋对侧脚踏步', '收尾', '回复位置'] },
    en: { question: 'Put the parts of a volley in the most correct order:', steps: ['Split step', 'Hip and shoulder rotation', 'Short, forward backswing', 'Contact in front of the body + step with the opposite foot', 'Follow-through', 'Recover your position'] },
  },
  // multi_select
  'd13e21ec-6bf1-4bb9-9674-55585b8370af': {
    'zh-HK': { question: '你在網前，打出一球令一名對手站位不佳、處於被動，選出正確的選項：', options: ['繼續攻那名站位不佳、被動的球員', '轉攻另一名球員令他們意料不到', '打中路製造猶豫與失誤', '施壓於已製造出的空檔'] },
    'zh-CN': { question: '你在网前，打出一球令一名对手站位不佳、处于被动，选出正确的选项：', options: ['继续攻那名站位不佳、被动的球员', '转攻另一名球员令他们意料不到', '打中路制造犹豫与失误', '施压于已制造出的空档'] },
    en: { question: "You're at the net and play a ball that leaves an opponent poorly positioned and uncomfortable. Select the correct options:", options: ['Keep playing to the poorly positioned, uncomfortable player', 'Switch to the other player to catch them off guard', 'Play down the middle to create doubt and errors', "Pressure the spaces you've created"] },
  },
  '4667e06d-0c09-4b2a-8f1b-b62aad8eeff5': {
    'zh-HK': { question: '如果你打中路，球應該怎樣？', options: ['慢速或快速', '中等速度', '切球', '快速'] },
    'zh-CN': { question: '如果你打中路，球应该怎样？', options: ['慢速或快速', '中等速度', '切球', '快速'] },
    en: { question: 'If you play down the middle, how should your ball travel?', options: ['Soft or fast', 'At medium speed', 'With slice', 'Fast'] },
  },
  '861cc364-685a-4efa-847b-61eed829f5bc': {
    'zh-HK': { question: '如果球能正確回到對方場區，在場外擊球是否有效？', options: ['無效', '只在比賽中', '我不知道', '有效，只要場地允許且擊球正確'] },
    'zh-CN': { question: '如果球能正确回到对方场区，在场外击球是否有效？', options: ['无效', '只在比赛中', '我不知道', '有效，只要场地允许且击球正确'] },
    en: { question: "Is it valid to hit the ball outside the court if it returns correctly to the opponent's side?", options: ["It's not valid", 'Only in competition', "I don't know", 'Yes, if the facility allows it and the shot is correct'] },
  },
  'f116e971-5bf4-4bf0-8dd1-33d7e81f2b4e': {
    'zh-HK': { question: '球分進行中，如果球員擊球後球拍碰到球網：', options: ['即使已經擊球仍自動失分', '該球員得分', '重打', '球分繼續'] },
    'zh-CN': { question: '球分进行中，如果球员击球后球拍碰到球网：', options: ['即使已经击球仍自动失分', '该球员得分', '重打', '球分继续'] },
    en: { question: 'During a point, if a player touches the net with the racket after hitting the ball:', options: ['Point lost automatically even though the ball was already struck', 'Point for that player', 'Replay', 'The point continues'] },
  },
  '2913a34e-8c63-4ad5-a6b0-9dd905e0427c': {
    'zh-HK': { question: '如果你打反牆球，球擊中牆與鐵網的交界處：', options: ['永遠無效', '永遠有效', '永遠重打', '視乎聲音'] },
    'zh-CN': { question: '如果你打反墙球，球击中墙与铁网的交界处：', options: ['永远无效', '永远有效', '永远重打', '视乎声音'] },
    en: { question: 'If you play a back-wall shot and the ball hits the joint between the wall and the fence:', options: ["It's always out", "It's always good", "It's always replayed", 'It depends on the sound'] },
  },
  '0c11e86b-1c8a-449a-8eda-250795115f51': {
    'zh-HK': { question: '在底線受壓下打正手，哪種技術組合最能保持控制？', options: ['在身體高度擊球＋平擊', '在身體前方擊球＋切球', '在身體後方擊球＋上旋', '在身體前方擊球＋平擊'] },
    'zh-CN': { question: '在底线受压下打正手，哪种技术组合最能保持控制？', options: ['在身体高度击球＋平击', '在身体前方击球＋切球', '在身体后方击球＋上旋', '在身体前方击球＋平击'] },
    en: { question: 'On a forehand from the back under pressure, which technical combination is most efficient for keeping control?', options: ['Contact at body height + flat hit', 'Contact in front of the body + slice', 'Contact behind the body + topspin', 'Contact in front of the body + flat hit'] },
  },
  '55a2ef32-1076-41b5-877a-540887a073e6': {
    'zh-HK': { question: '你在網前，想要更多球來到你這邊，你的隊友應該怎樣做？', options: ['多打平行線', '多打中路', '多打斜線', '變化方向製造猶豫'] },
    'zh-CN': { question: '你在网前，想要更多球来到你这边，你的队友应该怎样做？', options: ['多打平行线', '多打中路', '多打斜线', '变化方向制造犹豫'] },
    en: { question: "You're at the net and want the ball to come to you more often. What should your partner do?", options: ['Play more down the line', 'Play more down the middle', 'Play more crosscourt', 'Vary directions to create doubt'] },
  },
  '3e6ff059-41f9-4188-970f-61d72e9b137c': {
    'zh-HK': { question: '在過渡區你接到一個高但力量不足的球，最正確的擊球是？', options: ['因為球高就進攻', '輕輕打', '穩健且有深度地打', '打中路'] },
    'zh-CN': { question: '在过渡区你接到一个高但力量不足的球，最正确的击球是？', options: ['因为球高就进攻', '轻轻打', '稳健且有深度地打', '打中路'] },
    en: { question: 'You receive a high but lightweight ball in transition. What’s the most correct shot?', options: ['Play aggressively because the ball is high', 'Play it softly', 'Play safe and deep', 'Play down the middle'] },
  },
  'a11260a7-1dc0-4d6c-a497-ecbf3516f417': {
    'zh-HK': { question: '與隊友「協同移位（bascular）」是指什麼？', options: ['一起上網和退守', '與隊友一起移動、互相配合調整，不留出空檔', '封住中路以防被穿越', '補位隊友沒有覆蓋的空檔'] },
    'zh-CN': { question: '与队友“协同移位（bascular）”是指什么？', options: ['一起上网和退守', '与队友一起移动、互相配合调整，不留出空档', '封住中路以防被穿越', '补位队友没有覆盖的空档'] },
    en: { question: 'What does it mean to shift (bascular) with your partner?', options: ['Move up and back together', "Move with your partner, adjusting to each other so you don't leave open spaces", 'Cover the middle to stop them passing you', "Cover the spaces your partner doesn't"] },
  },
  // true_false (sin explanation)
  '57619be0-733b-4867-a82a-a6776a5095be': {
    'zh-HK': { statement: '打 bandeja 時，擊球點應該在眼睛高度。' },
    'zh-CN': { statement: '打 bandeja 时，击球点应该在眼睛高度。' },
    en: { statement: 'In the bandeja, the contact point should be at eye height.' },
  },
  'f3ddc197-212f-4cc0-929c-f817915f26fc': {
    'zh-HK': { question: '在一個長球分中，對手開始防守得更好、把所有球都回過來，你會怎樣做？', options: ['加入變化（高度、節奏、方向）打破節奏', '尋找致勝球', '保持壓力與方向，直到他們失誤', '加快比賽速度'] },
    'zh-CN': { question: '在一个长球分中，对手开始防守得更好、把所有球都回过来，你会怎样做？', options: ['加入变化（高度、节奏、方向）打破节奏', '寻找致胜球', '保持压力与方向，直到他们失误', '加快比赛速度'] },
    en: { question: 'In a long point, your opponents start defending better and return everything. What would you do?', options: ['Introduce variations (height, pace, direction) to break the rhythm', 'Go for the winning shot', 'Keep the pressure and placement until they make a mistake', 'Increase the speed of play'] },
  },
  // multi_select
  '95f7c16d-7dcf-483b-828a-914a3d53a965': {
    'zh-HK': { question: '你擊球時似乎碰到了球 2 次，選出正確的：', options: ['如果球沒有離開過拍面就算有效', '即使碰到 2 次也算有效', '沒有一個正確', '如果碰到 2 次或以上就算無效'] },
    'zh-CN': { question: '你击球时似乎碰到了球 2 次，选出正确的：', options: ['如果球没有离开过拍面就算有效', '即使碰到 2 次也算有效', '没有一个正确', '如果碰到 2 次或以上就算无效'] },
    en: { question: 'You hit the ball but it seems you touched it twice. Select the correct ones:', options: ['It’s good if the ball never left the racket face', "It's good even if you touch it twice", 'None are correct', 'If it made 2 or more contacts it’s no good'] },
  },
  // puzzles (base en inglés los dos primeros)
  '3f781417-0c7d-4afa-a9f9-dc95027b18cb': {
    'zh-HK': { statement: '你在網前，打出了一球令對手難以處理。你應該怎樣做？', options: [{ text: '向前移動，在對手回球後嘗試終結這一分', explanation: '你正處於有利位置，可以打快速截擊、pop out 或平面殺球來贏得該分。' }, { text: '留在原地不動', explanation: '你錯失了在下一拍終結球分的機會。' }] },
    'zh-CN': { statement: '你在网前，打出了一球令对手难以处理。你应该怎样做？', options: [{ text: '向前移动，在对手回球后尝试终结这一分', explanation: '你正处于有利位置，可以打快速截击、pop out 或平面杀球来赢得该分。' }, { text: '留在原地不动', explanation: '你错失了在下一拍终结球分的机会。' }] },
    es: { statement: 'Estás en la red y has jugado una bola difícil para el rival. ¿Qué deberías hacer?', options: [{ text: 'Avanzar e intentar cerrar el punto tras la devolución del rival', explanation: 'Estás en buena posición para jugar una volea rápida, un pop out o un remate plano y ganar el punto.' }, { text: 'Quedarte en la misma posición', explanation: 'Estás desaprovechando la oportunidad de cerrar el punto en el siguiente golpe.' }] },
  },
  'ef0a8dc5-ecd8-4896-9222-ff4e5ea3b4eb': {
    'zh-HK': { statement: '你應該把球回到哪裡，才能以最小風險上網？', options: [{ text: '打向左邊', explanation: '球網兩端最高：92 厘米' }, { text: '打向中間', explanation: '球網中央最低：88 厘米' }, { text: '打向右邊', explanation: '球網兩端最高：92 厘米' }] },
    'zh-CN': { statement: '你应该把球回到哪里，才能以最小风险上网？', options: [{ text: '打向左边', explanation: '球网两端最高：92 厘米' }, { text: '打向中间', explanation: '球网中央最低：88 厘米' }, { text: '打向右边', explanation: '球网两端最高：92 厘米' }] },
    es: { statement: '¿Dónde deberías devolver la bola para subir a la red con el menor riesgo?', options: [{ text: 'A la izquierda', explanation: 'La red es más alta en los extremos: 92 cm' }, { text: 'Al centro', explanation: 'La red es más baja en el centro: 88 cm' }, { text: 'A la derecha', explanation: 'La red es más alta en los extremos: 92 cm' }] },
  },
  '6dbcc76a-bbaa-4cb2-a983-685453380726': {
    'zh-HK': { statement: '只有你斜對面的球員上了網。\n你應該打甚麼球？', options: [{ text: '打角度球', explanation: '這個選擇風險很高，如果該球員夠專注，會打一記平行線截擊，令你的隊友陷入被動。' }, { text: '高球越過上了網的人', explanation: '即使高球打得好，他的隊友已在底線可以接應，能輕易回擊這個高球。' }, { text: '打低球給在底線的那位', explanation: '這樣你們同樣能搶到網前，而站在截擊位置的球員會被打到失位。' }] },
    'zh-CN': { statement: '只有你斜对面的球员上了网。\n你应该打什么球？', options: [{ text: '打角度球', explanation: '这个选择风险很高，如果该球员够专注，会打一记平行线截击，令你的队友陷入被动。' }, { text: '高球越过上了网的人', explanation: '即使高球打得好，他的队友已在底线可以接应，能轻易回击这个高球。' }, { text: '打低球给在底线的那位', explanation: '这样你们同样能抢到网前，而站在截击位置的球员会被打到失位。' }] },
    en: { statement: 'Only the player diagonally across from you has come up to the net.\nWhat shot should you play?', options: [{ text: 'Play the angle', explanation: "This option is very risky, and if the player is alert they'll hit a down-the-line volley, putting your partner in trouble." }, { text: 'Lob over the one at the net', explanation: "Even if the lob is good, their partner can help because they're already at the back and could return the lob easily." }, { text: 'Low to the one at the back', explanation: 'With this you still win the net, and the player in the volley position is left out of place.' }] },
  },
  '763676f9-e3ca-4930-9e50-182456ed31d4': {
    'zh-HK': { statement: '向側牆發球之後，我應該站在哪個位置？', options: [{ text: '位置 A', explanation: '更靠向中間上網，可以更好地覆蓋中路，而那正是接發球員最可能回球的方向。' }, { text: '位置 B', explanation: '中路（你和隊友之間）並未完全覆蓋，而那正是接發球員最可能回球的方向。' }, { text: '位置 C', explanation: '中路（你和隊友之間）完全沒有覆蓋，而那正是接發球員最可能回球的方向。' }] },
    'zh-CN': { statement: '向侧墙发球之后，我应该站在哪个位置？', options: [{ text: '位置 A', explanation: '更靠向中间上网，可以更好地覆盖中路，而那正是接发球员最可能回球的方向。' }, { text: '位置 B', explanation: '中路（你和队友之间）并未完全覆盖，而那正是接发球员最可能回球的方向。' }, { text: '位置 C', explanation: '中路（你和队友之间）完全没有覆盖，而那正是接发球员最可能回球的方向。' }] },
    en: { statement: 'After serving to the side wall, where should I position myself?', options: [{ text: 'Position A', explanation: 'By moving up more toward the center I can better cover the middle, which is the most likely direction for the returner.' }, { text: 'Position B', explanation: "The middle (between you and your partner) isn't fully covered, and it's the most likely direction for the returner." }, { text: 'Position C', explanation: "The middle (between you and your partner) is completely uncovered, and it's the most likely direction for the returner." }] },
  },
  '19877434-d3c2-48ec-a3d2-a4e6222bef75': {
    'zh-HK': { statement: '如果對手向你們球場中央打出一個不太好的高球，由誰來打 bandeja，並打向哪裡？（你和隊友都是右手持拍）', options: [{ text: '正手位球員打斜線', explanation: '正手位球員不但會被迫得很厲害，改變方向還會露出空檔。' }, { text: '反手位球員打中路', explanation: '你已經移動了那麼遠，不應該打中路，因為你製造了很大的空檔，沒有時間補回。' }, { text: '反手位球員打斜線', explanation: '打斜線能爭取時間，也更容易補好所有空檔。' }] },
    'zh-CN': { statement: '如果对手向你们球场中央打出一个不太好的高球，由谁来打 bandeja，并打向哪里？（你和队友都是右手持拍）', options: [{ text: '正手位球员打斜线', explanation: '正手位球员不但会被迫得很厉害，改变方向还会露出空档。' }, { text: '反手位球员打中路', explanation: '你已经移动了那么远，不应该打中路，因为你制造了很大的空档，没有时间补回。' }, { text: '反手位球员打斜线', explanation: '打斜线能争取时间，也更容易补好所有空档。' }] },
    en: { statement: 'If the opponents hit a not-very-good lob to the center of your court, who plays the bandeja and where? (Both you and your partner are right-handed)', options: [{ text: 'Forehand-side player, plays crosscourt', explanation: 'Besides being much more rushed, the forehand-side player would open gaps by changing the direction.' }, { text: 'Backhand-side player, plays down the middle', explanation: "Having moved so far, you shouldn't play down the middle because you've created a big gap and don't have time to cover it." }, { text: 'Backhand-side player, plays crosscourt', explanation: 'Playing crosscourt buys time and makes it much easier to cover all the gaps.' }] },
  },
};
