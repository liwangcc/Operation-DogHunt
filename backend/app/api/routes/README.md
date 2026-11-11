# 接口文件

已实现 `health.py`（`GET /api/v1/health`）与 `chat.py`：

- `GET /api/v1/model`：只返回模型名、配置齐全与否、超时秒数；不探测中转、不返回密钥。
- `POST /api/v1/chat`：接收交替排列的 user/assistant 消息，最后一条必须为 user；服务端添加 NBA 分析要求，调用中转站 Responses 接口。成功返回完整回答与 token 用量；错误返回脱敏提示，不自动重试。

后续按业务新增 `games.py`、`predictions.py`、`memories.py`、`tasks.py`，并在上一层 `router.py` 注册。当前没有这些业务接口，不使用返回假成功的占位接口。

接口层负责检查输入、调用 service、返回结果；外部服务请求、分析流程和数据库操作不要直接写在这里。
