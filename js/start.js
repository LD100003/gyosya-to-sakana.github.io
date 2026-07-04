(function () {
    // 获取 DOM 元素
    const startBtn = document.getElementById('startBtn');
    const titlePlaceholder = document.getElementById('titlePlaceholder');
    const videoWrapper = document.getElementById('videoWrapper');
    const video = document.getElementById('introVideo');
    const skipOverlay = document.getElementById('skipOverlay');

    // 标记是否已经跳转，防止重复触发
    let isRedirecting = false;

    // 跳转到主游戏页面
    function goToMain() {
        if (isRedirecting) return;
        isRedirecting = true;
        // 停止视频播放（可选）
        video.pause();
        // 跳转到 main.html
        window.location.href = 'main.html';
    }

    // 显示视频并开始播放
    function playVideo() {
        // 隐藏开始按钮和标题占位（淡出效果）
        startBtn.style.opacity = '0';
        titlePlaceholder.style.opacity = '0';
        // 短暂延迟后彻底隐藏（避免闪烁）
        setTimeout(() => {
            startBtn.classList.add('hidden');
            titlePlaceholder.classList.add('hidden');
        }, 500);

        // 显示视频容器
        videoWrapper.style.display = 'flex';
        // 显示跳过层
        skipOverlay.style.display = 'block';

        // 播放视频（由点击手势触发，浏览器允许）
        video.play().catch(err => {
            // 如果播放失败（例如未找到文件），直接跳转
            console.warn('视频播放失败，直接跳转:', err);
            goToMain();
        });
    }

    // ---------- 事件绑定 ----------

    // 1. 点击开始按钮 -> 播放视频
    startBtn.addEventListener('click', playVideo);

    // 2. 视频播放完毕 -> 跳转
    video.addEventListener('ended', goToMain);

    // 3. 点击跳过层 -> 跳转
    skipOverlay.addEventListener('click', goToMain);

    // 4. 如果视频加载出错，直接跳转
    video.addEventListener('error', function (e) {
        console.warn('视频加载错误，跳转至主游戏');
        goToMain();
    });

    // 5. 键盘支持（按任意键跳过，但只当视频显示时有效）
    document.addEventListener('keydown', function (e) {
        if (videoWrapper.style.display === 'flex') {
            // 如果视频正在播放，按任意键跳过
            goToMain();
        }
    });

    // 初始化时，确保视频容器和跳过层隐藏
    videoWrapper.style.display = 'none';
    skipOverlay.style.display = 'none';
    startBtn.classList.remove('hidden');
    titlePlaceholder.classList.remove('hidden');
    startBtn.style.opacity = '1';
    titlePlaceholder.style.opacity = '1';
})();
