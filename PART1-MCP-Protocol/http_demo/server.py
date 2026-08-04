#!/usr/bin/env python3
"""
MCP Streamable HTTP Server 演示

通过 HTTP + Chunked Transfer Encoding 与 Client 通信

运行方式:
    python server.py

Server 将监听 http://localhost:5000
端点:
    POST /mcp    - 接收 Client 请求并返回分块响应
    GET  /health - 健康检查
"""

import json
import uuid
import logging
import sys
from typing import Dict, Any, Optional
from flask import Flask, request, Response, jsonify
from flask_cors import CORS
from queue import Queue
import threading

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# 协议版本（2026-07-28 版本）
PROTOCOL_VERSION = "2026-07-28"


class Session:
    """客户端会话"""
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.message_queue = Queue()
        self.initialized = False
        self.tools = {
            "get_weather": {
                "description": "获取指定城市的天气信息",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string"}
                    },
                    "required": ["city"]
                }
            },
            "get_time": {
                "description": "获取当前时间",
                "parameters": {
                    "type": "object",
                    "properties": {}
                }
            }
        }

    def send_message(self, message: Dict[str, Any]) -> None:
        """发送消息到 Client"""
        self.message_queue.put(message)

    def get_messages(self):
        """获取所有待发送的消息"""
        messages = []
        while not self.message_queue.empty():
            messages.append(self.message_queue.get())
        return messages


class MCPServer:
    """MCP Streamable HTTP Server 实现"""

    def __init__(self):
        self.sessions: Dict[str, Session] = {}
        self.lock = threading.Lock()

    def create_session(self) -> Session:
        """创建新会话"""
        session_id = str(uuid.uuid4())
        session = Session(session_id)

        with self.lock:
            self.sessions[session_id] = session

        logger.info(f"创建新会话: {session_id}")
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """获取会话"""
        with self.lock:
            return self.sessions.get(session_id)

    def remove_session(self, session_id: str) -> None:
        """移除会话"""
        with self.lock:
            if session_id in self.sessions:
                del self.sessions[session_id]
                logger.info(f"移除会话: {session_id}")

    def handle_initialize(self, session: Session, request_id: Any, params: Dict) -> None:
        """处理初始化请求"""
        logger.info(f"[{session.session_id}] 初始化请求")

        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "serverInfo": {
                "name": "demo-http-server",
                "version": "1.0.0"
            },
            "capabilities": {
                "tools": {}
            }
        }

        session.send_message({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result
        })

        session.initialized = True

        # 发送初始化完成通知
        session.send_message({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        })

        logger.info(f"[{session.session_id}] 初始化完成")

    def handle_tools_list(self, session: Session, request_id: Any) -> None:
        """处理工具列表请求"""
        logger.info(f"[{session.session_id}] 工具列表请求")

        tools_list = [
            {
                "name": name,
                "description": info["description"],
                "inputSchema": info["parameters"]
            }
            for name, info in session.tools.items()
        ]

        session.send_message({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": tools_list}
        })

    def handle_tools_call(self, session: Session, request_id: Any, params: Dict) -> None:
        """处理工具调用"""
        tool_name = params.get("name")
        arguments = params.get("arguments", {})

        logger.info(f"[{session.session_id}] 调用工具: {tool_name}")

        if tool_name == "get_weather":
            city = arguments.get("city", "未知")
            import random
            temp = random.randint(15, 35)
            conditions = ["晴天", "多云", "阴天", "小雨"]
            condition = random.choice(conditions)

            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"🌤️ {city}天气：{condition}，{temp}°C"
                    }
                ]
            }
            session.send_message({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result
            })

        elif tool_name == "get_time":
            from datetime import datetime
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            result = {
                "content": [
                    {
                        "type": "text",
                        "text": f"🕐 当前时间：{now}"
                    }
                ]
            }
            session.send_message({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": result
            })

        else:
            session.send_message({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32601,
                    "message": f"未知工具: {tool_name}"
                }
            })

    def handle_ping(self, session: Session, request_id: Any) -> None:
        """处理 ping 请求"""
        session.send_message({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {}
        })


# 创建全局 Server 实例
server = MCPServer()


@app.route('/health', methods=['GET'])
def health_check():
    """健康检查端点"""
    return jsonify({
        "status": "healthy",
        "sessions": len(server.sessions)
    })


@app.route('/mcp', methods=['POST'])
def mcp_endpoint():
    """
    Streamable HTTP 端点

    Client 通过此端点发送请求，Server 通过 HTTP 分块传输返回响应
    """
    # 获取会话 ID
    session_id = request.headers.get('Mcp-Session-Id')
    mcp_version = request.headers.get('Mcp-Version', PROTOCOL_VERSION)

    # 验证协议版本
    if mcp_version != PROTOCOL_VERSION:
        return jsonify({
            "jsonrpc": "2.0",
            "error": {
                "code": -32000,
                "message": f"不支持的协议版本: {mcp_version}，期望: {PROTOCOL_VERSION}"
            }
        }), 400

    # 获取或创建会话
    session = None
    if session_id:
        session = server.get_session(session_id)
        if session:
            logger.info(f"[{session_id}] 恢复会话")
        else:
            # 会话不存在，创建新会话但使用提供的 ID
            session = server.create_session()
            session.session_id = session_id
            logger.info(f"[{session_id}] 创建新会话（原 ID 已失效）")

    if not session:
        session = server.create_session()
        session_id = session.session_id
        logger.info(f"[{session_id}] 创建新会话")

    def generate():
        """生成器：持续发送消息直到连接关闭"""
        try:
            # 持续发送消息
            while True:
                messages = session.get_messages()
                for msg in messages:
                    # 分块发送每条消息
                    chunk = json.dumps(msg) + "\n"
                    yield chunk.encode('utf-8')

                # 小延迟避免 CPU 占用过高
                import time
                time.sleep(0.1)

        except GeneratorExit:
            # Client 断开连接
            logger.info(f"[{session.session_id}] Client 断开连接")
        except Exception as e:
            logger.error(f"[{session.session_id}] 发送消息错误: {e}")

    # 获取请求数据
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON"}), 400

        # 解析 JSON-RPC 请求
        request_id = data.get('id')
        method = data.get('method')
        params = data.get('params', {})

        logger.info(f"[{session_id}] 收到请求: {method}")

        # 处理请求
        if method == "initialize":
            server.handle_initialize(session, request_id, params)
        elif method == "tools/list":
            server.handle_tools_list(session, request_id)
        elif method == "tools/call":
            server.handle_tools_call(session, request_id, params)
        elif method == "ping":
            server.handle_ping(session, request_id)
        else:
            session.send_message({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {
                    "code": -32601,
                    "message": f"未知方法: {method}"
                }
            })

        # 使用分块传输返回响应
        return Response(
            generate(),
            mimetype='application/json',
            headers={
                'Mcp-Session-Id': session_id,
                'Mcp-Version': PROTOCOL_VERSION,
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            }
        )

    except Exception as e:
        logger.error(f"处理请求错误: {e}")
        return jsonify({
            "jsonrpc": "2.0",
            "error": {
                "code": -32000,
                "message": f"服务器错误: {str(e)}"
            }
        }), 500


@app.route('/', methods=['GET'])
def index():
    """首页"""
    return f"""
    <h1>MCP Streamable HTTP Server Demo</h1>
    <p>协议版本: {PROTOCOL_VERSION}</p>
    <p>可用端点:</p>
    <ul>
        <li><code>GET /health</code> - 健康检查</li>
        <li><code>POST /mcp</code> - MCP 请求端点</li>
    </ul>
    <p>运行 <code>python client.py</code> 进行测试</p>
    """


def find_free_port(start_port=5000, max_port=5100):
    """查找可用端口"""
    import socket
    for port in range(start_port, max_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    raise RuntimeError("无法找到可用端口")


if __name__ == "__main__":
    print("=" * 60)
    print("MCP Streamable HTTP Server 演示")
    print("=" * 60)

    # 查找可用端口
    try:
        port = find_free_port()
        print(f"\n🚀 启动服务器...")
        print(f"📍 地址: http://localhost:{port}")
        print(f"📋 协议版本: {PROTOCOL_VERSION}")
    except RuntimeError:
        print("\n❌ 错误: 无法找到可用端口（5000-5100 都被占用）")
        print("请关闭其他程序后重试")
        sys.exit(1)

    print("\n可用端点:")
    print("   GET  /health     - 健康检查")
    print("   POST /mcp        - MCP 请求端点")
    print(f"\n在另一个终端运行: python client.py --port {port}")
    print("=" * 60 + "\n")

    app.run(host='0.0.0.0', port=port, threaded=True)
