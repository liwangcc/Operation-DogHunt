# 后端测试

`test_chat.py` 使用 Python 自带 unittest、httpx 的 MockTransport 与 ASGITransport，在进程内验证中转请求和网站接口。外部请求由本地样例代替，不读取真实模型配置、不消耗额度。

```sh
cd backend
.venv/bin/python -m unittest discover -s tests -v
```

覆盖 Responses 流与 JSON 兼容返回、额外认证头、401/403/404/429/503 错误、无自动重试、超时、半截回答不交付、配置缺失、输入边界、历史对话传递、服务端提示与单进程并发限制。真实中转成功记录另见交接，不把离线通过当成外部服务可用。

还覆盖聊天每次读取保存快照、不可用状态、选场及单平台隔离、所选比赛或平台失效时不调用模型、拒收前端伪造报价；`test_odds.py` 覆盖盘口整理与刷新边界。后续存储接入后，再覆盖记忆有效期与任务恢复。
