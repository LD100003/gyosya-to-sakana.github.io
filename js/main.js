// ================================================================
//  1. 鱼数据（从 data/fish.json 异步加载）
// ================================================================

/**
 * 普通鱼数据数组（由 JSON 加载，初始为空）
 * JSON 格式参考 data/fish.json
 */
let FISH_DATA = [];

/**
 * Boss 鱼数据（由 JSON 加载，初始为空）
 * 仅在周日（dayIndex === 6）出现
 */
let BOSS_FISH = null;

/**
 * 从 data/fish.json 异步加载所有鱼数据
 * JSON 结构：{ common: [...普通鱼数组], boss: {...Boss鱼对象} }
 * 每条鱼包含字段：id, name, nameJp, rarity, icon, image, personality, challenge, reward, questions
 *
 * 后续新增鱼种只需在 fish.json 中按格式添加即可，无需修改此代码
 */
async function loadFishData() {
    try {
        const response = await fetch('data/fish.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        FISH_DATA = data.common || [];
        BOSS_FISH = data.boss || null;
        console.log(`🐟 鱼数据加载完成：普通鱼 ${FISH_DATA.length} 种，Boss鱼 ${BOSS_FISH ? 1 : 0} 种`);
    } catch (err) {
        console.error('❌ 鱼数据加载失败，请确保通过 HTTP 服务器访问且 data/fish.json 存在:', err);
        // 加载失败时使用空数据，游戏仍可启动但不会出现鱼
        FISH_DATA = [];
        BOSS_FISH = null;
    }
}

// ================================================================
//  2. 音频管理器（单例模式）
// ================================================================

/**
 * 音频管理器，统一管理所有音效和背景音乐
 * 
 * 使用方式：
 *   - 播放音效: AudioManager.playSe('correct') 或 AudioManager.playSe('wrong')
 *   - 播放BGM: AudioManager.playBgm('ocean')
 *   - 停止BGM: AudioManager.stopBgm()
 * 
 * 音频文件路径: audio/
 *   - bgm_ocean.mp3    : 游戏界面背景音乐
 *   - se_open_door.mp3 : 进入家页面的开门音效
 *   - se_correct.mp3   : 答对题目音效
 *   - se_wrong.mp3     : 答错题目音效
 */
const AudioManager = {
    bgm: null,
    bgmVolume: 0.3,
    seVolume: 0.6,

    init() {
        this.bgm = new Audio();
        this.bgm.loop = true;
        this.bgm.volume = this.bgmVolume;
    },

    playSe(type) {
        const sePaths = {
            correct: 'audio/se_correct.mp3',
            wrong: 'audio/se_wrong.mp3',
            open_door: 'audio/se_open_door.mp3'
        };
        if (!sePaths[type]) return;

        const se = new Audio(sePaths[type]);
        se.volume = this.seVolume;
        se.play().catch(err => {
            console.warn('音效播放失败:', type, err);
        });
    },

    playBgm(type) {
        const bgmPaths = {
            ocean: 'audio/bgm_ocean.mp3'
        };
        if (!bgmPaths[type]) return;

        if (this.bgm && this.bgm.src && !this.bgm.paused) {
            this.bgm.pause();
        }

        this.bgm.src = bgmPaths[type];
        this.bgm.play().catch(err => {
            console.warn('BGM播放失败（可能需要用户交互）:', err);
        });
    },

    stopBgm() {
        if (this.bgm) {
            this.bgm.pause();
            this.bgm.currentTime = 0;
        }
    },

    setBgmVolume(volume) {
        this.bgmVolume = volume;
        if (this.bgm) this.bgm.volume = volume;
    },

    setSeVolume(volume) {
        this.seVolume = volume;
    }
};

// ================================================================
//  3. 星期・天气・难度设定
// ================================================================

/** 星期名称列表 */
const WEEK_DAYS = ['月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日', '日曜日'];

/** 天气候选 */
const WEATHERS = ['晴れ', '曇り', '雨', '風'];

/**
 * 每日配置
 * target: 当日目标鱼数
 * requiredCorrect: 每条鱼需要的正确回答数
 */
const DAILY_CONFIG = [
    { target: 3, requiredCorrect: 2 },
    { target: 4, requiredCorrect: 3 },
    { target: 4, requiredCorrect: 3 },
    { target: 5, requiredCorrect: 4 },
    { target: 5, requiredCorrect: 4 },
    { target: 5, requiredCorrect: 5 },
    { target: 5, requiredCorrect: 5 }
];

// ================================================================
//  3. 游戏状态（全部状态）
// ================================================================

const GameState = {
    // 玩家长期数据
    player: {
        score: 0, // 累计得分
        currentCombo: 0, // 当前连续正确数
        maxCombo: 0, // 最大连续正确数
        totalCorrect: 0, // 总正确数
        totalWrong: 0, // 总错误数
        fishCaught: [] // 捕获的鱼的历史 [{fishId, caughtCount}]
    },
    // 当前日期信息
    dayIndex: 0, // 0=周一 ... 6=周日
    weather: '晴れ', // 当天天气
    dailyTarget: 3, // 当天目标
    isBossDay: false, // 是否为Boss日
    bossDefeated: false, // Boss是否已击败

    // 当前钓鱼会话
    trip: {
        maxFish: 5, // 当天目标数（与dailyTarget相同）
        caughtThisTrip: 0, // 当前已钓数
        currentFishId: null, // 当前面对的鱼ID
        fishData: null // 当前面对的鱼数据对象
    },
    // 测验状态
    quiz: {
        questions: [], // 当前鱼的问题列表
        currentIndex: 0, // 当前第几题
        correctCount: 0, // 当前鱼的正确数
        requiredCorrect: 0 // 钓起这条鱼所需正确数
    },
    // 流程控制
    flow: {
        state: 'idle', // idle | answering | feedback | result | dayEnd | gameOver | victory
        pendingTimeout: null // setTimeout 句柄
    },
    // 模态框控制
    modalResolve: null,
    // 主页显示标志
    isHomeVisible: false,
};

// ================================================================
//  4. DOM 元素缓存
// ================================================================

const DOM = {
    progressIcons: document.getElementById('progress-icons'),
    comboCount: document.getElementById('combo-count'),
    scoreCount: document.getElementById('score-count'),
    dayCount: document.getElementById('day-count'),
    fishDisplay: document.getElementById('fish-display'),
    fishSprite: document.getElementById('fish-sprite'),
    fishBubble: document.getElementById('fish-bubble'),
    fishName: document.getElementById('fish-name'),
    fishDialogue: document.getElementById('fish-dialogue'),
    optionsArea: document.getElementById('options-area'),
    optionBtns: document.querySelectorAll('.option-btn'),
    playerDialogue: document.getElementById('player-dialogue'),
    btnNextCatch: document.getElementById('btn-next-catch'),
    modalOverlay: document.getElementById('modal-overlay'),
    modalIcon: document.getElementById('modal-icon'),
    modalTitle: document.getElementById('modal-title'),
    modalSub: document.getElementById('modal-sub'),
    modalActions: document.getElementById('modal-actions'),
    modalBox: document.getElementById('modal-box'),
    // 主页
    homeContainer: document.getElementById('home-container'),
    homeScore: document.getElementById('home-score'),
    homeTotal: document.getElementById('home-total'),
    homePokedex: document.getElementById('home-pokedex'),
    homeFishing: document.getElementById('home-fishing'),
    pokedexGrid: document.getElementById('pokedex-grid'),
    homeWeatherInfo: document.getElementById('home-weather-info'),
    homeTargetInfo: document.getElementById('home-target-info'),
    homeProgressInfo: document.getElementById('home-progress-info'),
    homeProgressDots: document.getElementById('home-progress-dots'),
    homeEncourage: document.getElementById('home-encourage'),
    btnGoFishing: document.getElementById('btn-go-fishing'),
    homeTabs: document.querySelectorAll('.home-tab'),
    body: document.body,
};

// ================================================================
//  5. 工具函数
// ================================================================

/** 清除挂起的超时 */
function clearPendingTimeout() {
    if (GameState.flow.pendingTimeout) {
        clearTimeout(GameState.flow.pendingTimeout);
        GameState.flow.pendingTimeout = null;
    }
}

/** 打乱数组（Fisher–Yates） */
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** 从数组中随机取一个 */
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** 根据索引获取星期名称 */
function getDayName(index) {
    return WEEK_DAYS[index] || '月曜日';
}

/** 随机天气 */
function getRandomWeather() {
    return pickRandom(WEATHERS);
}

/** 根据索引获取每日配置 */
function getDayConfig(index) {
    return DAILY_CONFIG[index] || DAILY_CONFIG[0];
}

/** 根据ID获取鱼数据（普通或Boss） */
function getFishById(id) {
    let found = FISH_DATA.find(f => f.id === id);
    if (found) return found;
    if (id === 'boss') return BOSS_FISH;
    return null;
}

/** 稀有度标签 */
function getRarityLabel(rarity) {
    const map = {
        'common': '普通',
        'uncommon': '珍しい',
        'rare': 'レア',
        'boss': '伝説'
    };
    return map[rarity] || rarity;
}

// ================================================================
//  6. HUD 更新
// ================================================================

/** 更新进度图标 */
function updateProgressHUD() {
    const { caughtThisTrip, maxFish } = GameState.trip;
    DOM.progressIcons.innerHTML = Array.from({ length: maxFish }, (_, i) =>
        `<span class="progress-fish ${i < caughtThisTrip ? 'caught' : 'empty'}">🐟</span>`
    ).join('');
}

/** 更新连击 */
function updateComboHUD() {
    DOM.comboCount.textContent = `×${GameState.player.currentCombo}`;
    DOM.comboCount.classList.toggle('highlight', GameState.player.currentCombo >= 5);
}

/** 更新得分 */
function updateScoreHUD() {
    DOM.scoreCount.textContent = GameState.player.score;
}

/** 更新星期 */
function updateDayHUD() {
    DOM.dayCount.textContent = getDayName(GameState.dayIndex);
}

/** 全部HUD更新 */
function updateAllHUD() {
    updateProgressHUD();
    updateComboHUD();
    updateScoreHUD();
    updateDayHUD();
}

// ================================================================
//  7. 鱼与气泡显示控制
// ================================================================

function showFish(fishData) {
    // 优先使用 JSON 中指定的 image 路径，兜底回退到 images/ID.jpg 规则
    DOM.fishSprite.src = fishData.image || `images/${fishData.id}.jpg`;
    // 图片加载失败时显示占位图
    DOM.fishSprite.onerror = () => { DOM.fishSprite.src = 'images/fish_placeholder.jpg'; };
    DOM.fishDisplay.classList.remove('hidden');
    DOM.fishName.textContent = `${fishData.nameJp} (${fishData.name})`;
    DOM.fishBubble.classList.remove('hidden');
}

function hideFish() {
    DOM.fishDisplay.classList.add('hidden');
    DOM.fishBubble.classList.add('hidden');
}

function setFishDialogue(t) {
    DOM.fishDialogue.textContent = t;
}

function setPlayerDialogue(t) {
    DOM.playerDialogue.textContent = t;
}

// ================================================================
//  8. 选项显示控制
// ================================================================

function showOptions(q) {
    DOM.optionsArea.classList.remove('hidden');
    DOM.optionBtns.forEach((btn, i) => {
        btn.querySelector('.option-text').textContent = q.options[i];
        btn.classList.remove('correct', 'wrong');
        btn.disabled = false;
    });
}

function hideOptions() {
    DOM.optionsArea.classList.add('hidden');
}

function showFeedback(selectedIdx, correctIdx) {
    DOM.optionBtns.forEach((btn, i) => {
        btn.disabled = true;
        if (i === correctIdx) btn.classList.add('correct');
        if (i === selectedIdx && selectedIdx !== correctIdx) btn.classList.add('wrong');
    });
}

function setNextButton(visible, text) {
    DOM.btnNextCatch.disabled = !visible;
    DOM.btnNextCatch.style.display = visible ? 'block' : 'none';
    if (text !== undefined) DOM.btnNextCatch.textContent = text;
}

// ================================================================
//  9. 模态框系统
// ================================================================

function showModal(icon, title, sub, primaryText, primaryClass, extraButtons) {
    return new Promise((resolve) => {
        DOM.modalIcon.textContent = icon;
        DOM.modalTitle.textContent = title;
        DOM.modalTitle.className = 'modal-title' + (title.includes('龍魚') ? ' boss' : '');
        DOM.modalSub.innerHTML = sub;
        DOM.modalBox.classList.remove('detail-modal');

        DOM.modalActions.innerHTML = '';

        const btn = document.createElement('button');
        btn.className = 'modal-btn' + (primaryClass ? ' ' + primaryClass : '');
        btn.textContent = primaryText || '確認';
        btn.addEventListener('click', () => {
            DOM.modalOverlay.classList.add('hidden');
            resolve('primary');
        });
        DOM.modalActions.appendChild(btn);

        if (extraButtons) {
            extraButtons.forEach(eb => {
                const b = document.createElement('button');
                b.className = 'modal-btn ' + (eb.cls || 'secondary');
                b.textContent = eb.label;
                b.addEventListener('click', () => {
                    DOM.modalOverlay.classList.add('hidden');
                    resolve(eb.value);
                });
                DOM.modalActions.appendChild(b);
            });
        }

        DOM.modalOverlay.classList.remove('hidden');
    });
}

/** 鱼详情模态框（图鉴用） */
function showFishDetailModal(fishId) {
    const fish = getFishById(fishId);
    if (!fish) return;

    const caught = GameState.player.fishCaught.find(f => f.fishId === fishId);
    const count = caught ? caught.caughtCount : 0;

    let questionsHtml = '';
    fish.questions.forEach((q, idx) => {
        questionsHtml += `
                        <div class="q-item">
                            <div class="q-text">Q${idx + 1}: ${q.question}</div>
                            <div class="q-answer">✅ 正解: ${q.options[q.answer]}</div>
                        </div>
                    `;
    });

    const p = fish.personality;
    const personalityHtml = `
                    <div class="personality">
                        <div class="p-line">🐟 初対面: 「${p.greeting}」</div>
                        <div class="p-line">✅ 正解: 「${p.tauntCorrect}」</div>
                        <div class="p-line">❌ 不正解: 「${p.tauntWrong}」</div>
                        <div class="p-line">🏳️ 降参: 「${p.surrender}」</div>
                    </div>
                `;

    const sub = `
                    <div style="margin-bottom:12px;">
                        <span style="color:#ffd54f;">${fish.nameJp}</span> (${fish.name})<br>
                        レアリティ: ${getRarityLabel(fish.rarity)} &nbsp;|&nbsp; 捕獲: ${count}回
                    </div>
                    <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.1); padding-top:12px;">
                        <strong style="color:#b0c8d8;">📝 出題履歴</strong>
                        ${questionsHtml}
                    </div>
                    <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.1); padding-top:12px;">
                        <strong style="color:#b0c8d8;">💬 性格台词</strong>
                        ${personalityHtml}
                    </div>
                `;

    DOM.modalBox.classList.add('detail-modal');
    return showModal('🐟', `${fish.nameJp} の詳細`, sub, '閉じる', '');
}

// ----- 各种场景模态框 -----

/** 日记模态框（日开始） */
async function showDiary() {
    const dayName = getDayName(GameState.dayIndex);
    const weather = GameState.weather;
    const config = getDayConfig(GameState.dayIndex);
    const target = config.target;

    let message = `${dayName}、${weather}。`;

    if (GameState.dayIndex === 0) {
        message += `今日は${target}匹、確実に釣り上げるぞ。`;
    } else if (GameState.dayIndex === 6) {
        message += `いよいよ龍魚との決戦だ。${target}匹、全てをかける。`;
    } else {
        message += `今日は${target}匹、しっかり釣る。`;
    }

    if (weather === '雨') message += ' 雨の日は大物が釣れるという。';
    if (weather === '風') message += ' 風が強い。竿がしなる。';
    if (GameState.dayIndex === 0) {
        message += ' 今日も魚たちは何を聞いてくるかな。';
    }

    return showModal('📖', `${dayName}・${weather}`, message, '出漁する', '');
}

/** 日次完成模态框 */
async function showDayComplete() {
    const dayName = getDayName(GameState.dayIndex);
    const isLastDay = GameState.dayIndex === 6;
    let title = `🐟 ${dayName}、完了！`;
    let sub = `${GameState.trip.caughtThisTrip}匹 釣り上げた。<br>スコア: <span class="highlight">${GameState.player.score}</span>`;

    if (isLastDay && GameState.bossDefeated) {
        return showModal('🏆', '🎉 伝説の龍魚を討ち取った！', `全ての日程を完了した！<br>最終スコア: <span class="highlight">${GameState.player.score}</span>`, 'おめでとう！', 'success');
    }

    return showModal('🏠', title, sub, '続けて釣る', '', [
        { label: '家に帰る', value: 'home', cls: 'secondary' }
    ]);
}

/** 游戏结束模态框（保留但实际不再使用） */
async function showGameOverModal() {
    const dayName = getDayName(GameState.dayIndex);
    return showModal('🌅', `「${dayName}、日が暮れた」`,
        `${dayName}の漁は終わった。<br>また明日、新しい潮が来る。`, '最初から始める', 'danger');
}

// ================================================================
//  10. 游戏核心逻辑
// ================================================================

/** 随机选择一条鱼（Boss日返回Boss） */
function selectRandomFish() {
    if (GameState.isBossDay) {
        return { ...BOSS_FISH, questions: [...BOSS_FISH.questions] };
    }
    const fish = pickRandom(FISH_DATA);
    return { ...fish, questions: [...fish.questions] };
}

/** 从鱼的问题池中随机抽取指定数量 */
function selectQuestionsForFish(fishData) {
    const pool = [...fishData.questions];
    const count = fishData.challenge.totalQuestions || 5;
    shuffle(pool);
    return pool.slice(0, count);
}

/** 处理回答 */
function handleAnswer(index) {
    if (GameState.flow.state !== 'answering') return;

    clearPendingTimeout();
    GameState.flow.state = 'feedback';

    const q = GameState.quiz.questions[GameState.quiz.currentIndex];
    const correct = index === q.answer;
    showFeedback(index, q.answer);

    const fish = GameState.trip.fishData;
    if (correct) {
        AudioManager.playSe('correct');
        GameState.quiz.correctCount++;
        GameState.player.currentCombo++;
        GameState.player.totalCorrect++;
        if (GameState.player.currentCombo > GameState.player.maxCombo) {
            GameState.player.maxCombo = GameState.player.currentCombo;
        }
        let reward = fish.reward.gold || 50;
        if (GameState.player.currentCombo >= 5) reward += 10;
        GameState.player.score += reward;
        setFishDialogue(fish.personality.tauntCorrect);
        setPlayerDialogue(`「よし！正解！ +${reward} スコア」`);
    } else {
        AudioManager.playSe('wrong');
        GameState.player.currentCombo = 0;
        GameState.player.totalWrong++;
        setFishDialogue(fish.personality.tauntWrong);
        setPlayerDialogue('「しくじった…次は間違えるなよ。」');
    }

    updateAllHUD();
    GameState.flow.pendingTimeout = setTimeout(() => {
        hideOptions();
        proceedAfterAnswer();
    }, 1200);
}

/** 一题结束后的处理（下一题或判定） */
function proceedAfterAnswer() {
    GameState.quiz.currentIndex++;
    const { currentIndex, questions, correctCount } = GameState.quiz;
    const config = getDayConfig(GameState.dayIndex);
    const required = config.requiredCorrect;

    if (correctCount >= required) {
        handleCatchSuccess();
    } else if (currentIndex < questions.length) {
        showNextQuestion();
    } else {
        handleCatchFail();
    }
}

/** 显示下一题 */
function showNextQuestion() {
    const q = GameState.quiz.questions[GameState.quiz.currentIndex];
    GameState.flow.state = 'answering';
    setFishDialogue(q.question);
    showOptions(q);
    setPlayerDialogue('「うーん…考え中…」');
}

/** 钓鱼成功 */
function handleCatchSuccess() {
    GameState.flow.state = 'result';
    const fish = GameState.trip.fishData;
    GameState.trip.caughtThisTrip++;

    // 更新捕获记录
    const exist = GameState.player.fishCaught.find(f => f.fishId === fish.id);
    if (exist) exist.caughtCount++;
    else GameState.player.fishCaught.push({ fishId: fish.id, caughtCount: 1 });

    setFishDialogue(fish.personality.surrender);
    setPlayerDialogue('「よし、一匹目！いい感じだ。」');
    updateAllHUD();
    clearPendingTimeout();

    GameState.flow.pendingTimeout = setTimeout(() => {
        hideFish();
        if (GameState.trip.caughtThisTrip >= GameState.trip.maxFish) {
            if (GameState.isBossDay) {
                GameState.bossDefeated = true;
            }
            handleDayComplete();
        } else {
            GameState.flow.state = 'idle';
            setNextButton(true, '🎣 次の一投');
            setPlayerDialogue(`「あと ${GameState.trip.maxFish - GameState.trip.caughtThisTrip} 匹だ。」`);
        }
    }, 2000);
}

/** 钓鱼失败 */
function handleCatchFail() {
    GameState.flow.state = 'result';
    const fish = GameState.trip.fishData;
    setFishDialogue(fish.personality.tauntWrong);
    setPlayerDialogue('「逃げられた…次こそ。」');
    updateAllHUD();
    clearPendingTimeout();

    GameState.flow.pendingTimeout = setTimeout(() => {
        hideFish();
        GameState.flow.state = 'idle';
        setNextButton(true, '🎣 次の一投');
        setPlayerDialogue(`「まだ ${GameState.trip.maxFish - GameState.trip.caughtThisTrip} 匹残っている。」`);
    }, 2000);
}

// ---- 日次管理 ----

/** 日次完成 */
async function handleDayComplete() {
    setNextButton(false);
    GameState.flow.state = 'dayEnd';

    const isLastDay = GameState.dayIndex === 6;

    if (isLastDay && GameState.bossDefeated) {
        await showModal('🏆', '🎉 伝説の龍魚を討ち取った！',
            `全ての日程を完了した！<br>最終スコア: <span class="highlight">${GameState.player.score}</span>`,
            'おめでとう！', 'success');
        resetGame();
        return;
    }

    const result = await showDayComplete();

    if (result === 'home') {
        showHome();
    } else {
        await nextDay();
    }
}

/** 进入下一天 */
async function nextDay() {
    if (GameState.dayIndex >= 6) {
        resetGame();
        return;
    }

    // 清除挂起超时
    clearPendingTimeout();

    // 日期推进
    GameState.dayIndex++;
    GameState.trip.caughtThisTrip = 0;
    GameState.player.currentCombo = 0;
    GameState.flow.state = 'idle';
    hideFish();
    hideOptions();
    setNextButton(false);
    updateAllHUD();

    // 开始新一天
    await startNewDay();
}

/** 开始新的一天 */
async function startNewDay() {
    const config = getDayConfig(GameState.dayIndex);
    GameState.dailyTarget = config.target;
    GameState.trip.maxFish = GameState.dailyTarget;
    GameState.isBossDay = (GameState.dayIndex === 6);
    GameState.weather = getRandomWeather();

    updateAllHUD();
    setNextButton(false);

    await showDiary();

    // 进入游戏场景，播放背景音乐
    AudioManager.playBgm('ocean');

    setPlayerDialogue(`「${getDayName(GameState.dayIndex)}、${GameState.weather}。${GameState.dailyTarget}匹、やるぞ。」`);
    setNextButton(true, '🎣 次の一投');
    GameState.flow.state = 'idle';
}

/** 重置游戏（保留在主页显示） */
function resetGame() {
    clearPendingTimeout();

    GameState.dayIndex = 0;
    GameState.weather = '晴れ';
    GameState.isBossDay = false;
    GameState.bossDefeated = false;
    GameState.player.score = 0;
    GameState.player.currentCombo = 0;
    GameState.player.maxCombo = 0;
    GameState.player.totalCorrect = 0;
    GameState.player.totalWrong = 0;
    GameState.player.fishCaught = [];
    GameState.trip.caughtThisTrip = 0;

    GameState.flow.state = 'idle';
    updateAllHUD();
    hideFish();
    hideOptions();
    setNextButton(false);
    setPlayerDialogue('「さあ、出漁しよう。」');
}

/** 从主页开始游戏（由“出漁”按钮触发） */
function startGameFromHome() {
    // 判断是否已有进行中的游戏
    if (GameState.dayIndex === 0 && GameState.trip.caughtThisTrip === 0 && GameState.flow.state === 'idle') {
        // 第一天尚未开始，启动新一天
        hideHome(false);
        startNewDay();
    } else {
        // 已有进度，直接返回游戏，不重置
        hideHome(false);
        // 更新UI确保显示当前进度
        updateAllHUD();
        setNextButton(true, '🎣 次の一投');
        setPlayerDialogue(`「${getDayName(GameState.dayIndex)}の漁を続ける。」`);
        GameState.flow.state = 'idle';
        // 返回游戏场景，播放背景音乐
        AudioManager.playBgm('ocean');
    }
}

/** 下一竿（开始钓鱼） */
function startNextCatch() {
    if (GameState.flow.state !== 'idle') return;
    if (GameState.trip.caughtThisTrip >= GameState.trip.maxFish) {
        handleDayComplete();
        return;
    }

    clearPendingTimeout();
    setNextButton(false);

    const fish = selectRandomFish();
    GameState.trip.currentFishId = fish.id;
    GameState.trip.fishData = fish;

    const qs = selectQuestionsForFish(fish);
    const config = getDayConfig(GameState.dayIndex);
    GameState.quiz = {
        questions: qs,
        currentIndex: 0,
        correctCount: 0,
        requiredCorrect: config.requiredCorrect
    };

    GameState.flow.state = 'fish-intro';
    showFish(fish);
    setFishDialogue(fish.personality.greeting);
    setPlayerDialogue('「さて、何を聞いてくる？」');

    GameState.flow.pendingTimeout = setTimeout(showNextQuestion, 1500);
}

// ================================================================
//  11. 主页（渔者之家）功能
// ================================================================

/** 切换 body 背景 */
function setBodyBackground(isHome) {
    if (isHome) {
        DOM.body.style.backgroundImage = "url('images/home.png')";
    } else {
        DOM.body.style.backgroundImage = "url('images/beach_bg.png')";
    }
}

/** 显示主页 */
function showHome() {
    // 停止游戏背景音乐（家页面无BGM）
    AudioManager.stopBgm();
    // 播放开门音效
    AudioManager.playSe('open_door');

    setBodyBackground(true);
    GameState.isHomeVisible = true;
    DOM.homeContainer.classList.add('active');

    updateHomeStats();
    renderPokedex();
    updateFishingPrep();

    // 默认“出海”标签
    switchHomeTab('fishing');
}

/** 隐藏主页 */
function hideHome(goToNextDay = false) {
    DOM.homeContainer.classList.remove('active');
    GameState.isHomeVisible = false;
    setBodyBackground(false);

    if (goToNextDay) {
        // 在家过夜 → 下一天
        if (GameState.dayIndex >= 6) {
            resetGame();
        } else {
            (async () => {
                await nextDay();
            })();
        }
    } else {
        // 继续出海，更新HUD
        updateAllHUD();
    }
}

/** 更新主页头部统计 */
function updateHomeStats() {
    DOM.homeScore.textContent = GameState.player.score;
    const total = GameState.player.fishCaught.reduce((sum, f) => sum + f.caughtCount, 0);
    DOM.homeTotal.textContent = total;
}

/** 渲染图鉴 */
function renderPokedex() {
    const grid = DOM.pokedexGrid;
    grid.innerHTML = '';

    const caught = GameState.player.fishCaught;

    if (caught.length === 0) {
        grid.innerHTML = `
                        <div class="empty-pokedex" style="grid-column:1/-1;">
                            <span class="big-icon">🐠</span>
                            まだ魚がいない…<br>
                            <span class="hint">出漁して魚を釣ろう！</span>
                        </div>
                    `;
        return;
    }

    const sorted = [...caught].sort((a, b) => a.fishId.localeCompare(b.fishId));

    sorted.forEach(entry => {
        const fish = getFishById(entry.fishId);
        if (!fish) return;

        const card = document.createElement('div');
        card.className = 'pokedex-card';

        // 图标优先取 JSON 中的 icon 字段，未配置则使用默认 🐟
        const icon = fish.icon || '🐟';

        card.innerHTML = `
                        <span class="fish-icon">${icon}</span>
                        <div class="fish-name">${fish.nameJp}</div>
                        <div class="fish-sub">${fish.name}</div>
                        <div class="fish-rarity">${getRarityLabel(fish.rarity)}</div>
                        <div class="fish-count">捕獲 ×${entry.caughtCount} 回</div>
                    `;

        card.addEventListener('click', () => {
            showFishDetailModal(fish.id);
        });

        grid.appendChild(card);
    });
}

/** 更新出海准备视图 */
function updateFishingPrep() {
    const dayName = getDayName(GameState.dayIndex);
    const weather = GameState.weather;
    const config = getDayConfig(GameState.dayIndex);
    const target = config.target;
    const caught = GameState.trip.caughtThisTrip;

    DOM.homeWeatherInfo.textContent = `${dayName}・${weather}`;
    DOM.homeTargetInfo.textContent = `${target} 匹`;
    DOM.homeProgressInfo.textContent = `${caught} / ${target} 匹`;

    const dotsContainer = DOM.homeProgressDots;
    dotsContainer.innerHTML = '';
    for (let i = 0; i < target; i++) {
        const dot = document.createElement('span');
        dot.className = `dot ${i < caught ? 'caught' : ''}`;
        dot.textContent = '🐟';
        dotsContainer.appendChild(dot);
    }

    const encourages = [
        '今日もいい漁になりますように。',
        '海は穏やかだ。良い日になりそうだ。',
        '魚たちは待っているぞ。',
        '潮の流れを読めば、きっと大漁だ。',
        '焦らず、じっくり行こう。',
        '竿の先に、何が来るか…。'
    ];
    DOM.homeEncourage.textContent = pickRandom(encourages);
}

/** 切换主页标签 */
function switchHomeTab(tabId) {
    DOM.homeTabs.forEach(tab => {
        const isActive = tab.dataset.tab === tabId;
        tab.classList.toggle('active', isActive);
    });

    DOM.homePokedex.classList.toggle('hidden', tabId !== 'pokedex');
    DOM.homeFishing.classList.toggle('hidden', tabId !== 'fishing');

    if (tabId === 'pokedex') {
        renderPokedex();
    } else if (tabId === 'fishing') {
        updateFishingPrep();
    }
}

/** 绑定主页事件 */
function bindHomeEvents() {
    DOM.homeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchHomeTab(tab.dataset.tab);
        });
    });

    DOM.btnGoFishing.addEventListener('click', () => {
        // 从主页开始游戏（判断有无进度）
        startGameFromHome();
    });

    // 返回按钮已删除，无需绑定
}

// ================================================================
//  12. 测试函数（开发用）
// ================================================================

/** 测试：下一天（强制完成当天） */
async function testNextDay() {
    clearPendingTimeout();
    GameState.flow.state = 'idle';
    hideOptions();
    hideFish();

    if (GameState.dayIndex >= 6) {
        resetGame();
        return;
    }
    // 假装已经完成目标
    GameState.trip.caughtThisTrip = GameState.trip.maxFish;
    await handleDayComplete();
}

/** 测试：自动选择正确答案 */
function testCorrectAnswer() {
    if (GameState.flow.state !== 'answering') return;
    const q = GameState.quiz.questions[GameState.quiz.currentIndex];
    handleAnswer(q.answer);
}

/** 测试：重置 */
function testReset() {
    resetGame();
    showHome();
}

/** 测试：回家 */
function testGoHome() {
    showHome();
}

// ================================================================
//  13. 事件绑定
// ================================================================

function bindEvents() {
    // 选项按钮
    DOM.optionBtns.forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
    });

    // 主按钮（下一竿）
    DOM.btnNextCatch.addEventListener('click', startNextCatch);

    // 键盘（1-4）
    document.addEventListener('keydown', (e) => {
        if (GameState.flow.state !== 'answering') return;
        const map = { '1': 0, '2': 1, '3': 2, '4': 3 };
        if (map[e.key] !== undefined) handleAnswer(map[e.key]);
    });

    // 测试按钮
    document.getElementById('test-next-day').addEventListener('click', testNextDay);
    document.getElementById('test-correct-answer').addEventListener('click', testCorrectAnswer);
    document.getElementById('test-reset').addEventListener('click', testReset);
    document.getElementById('test-go-home').addEventListener('click', testGoHome);

    // 主页事件
    bindHomeEvents();
}

// ================================================================
//  14. 初始化
// ================================================================

window.addEventListener('DOMContentLoaded', async () => {
    // 先异步加载鱼数据，再初始化游戏
    await loadFishData();

    // 初始化音频管理器
    AudioManager.init();

    // 初始状态：重置游戏数据，但显示主页
    resetGame();
    showHome();
    bindEvents();
    console.log('🎣 漁者と魚 - 日本語学習釣りゲーム');
    console.log('📅 7日間の日程、日曜日はボス戦');
    console.log('🏠 家では図鑑と出漁準備ができます');
    console.log('⚙️ 右側のテストパネルでデバッグ可能');
    console.log('⏳ タイマーは削除済み、制限なしで遊べます');
});
