#!/usr/bin/env python3
"""
MCP Streamable HTTP Client 演示

通过 HTTP + Chunked Transfer Encoding 与 Server 通信

运行方式:
    python client.py

依赖:
    pip install requests
"""

import json
import sys
import time
import threading
import requests
from typing import Dict, Any, Optional
from urllib.parse import urljoin


# 协议版本（2026-07-28 版本）
PROTOCOL_VERSION = "2026-07-28"


class MCPClient:
    """MCP Streamable HTTP Client 实现"""

    def __init__(self, base_url: str = "http://localhost:5000"):
        """
        初始化 Client

        Args:
            base_url: Server 基础 URL
        """
        self.base_url = base_url
        self.session_id: Optional[str] = None
        self.receive_thread: Optional[threading.Thread] = None
        self.running = False
        self.message_handlers: Dict[str, callable] = {}
        self.pending_responses: Dict[Any, Dict] = {}
        self.request_id = 0
        self.lock = threading.Lock()

    def connect(self) -> bool:
        """连接到 Server"""
        print(f"🔗 连接到 Server: {self.base_url}")

        # 1. 检查 Server 健康状态
        try:
            response = requests.get(urljoin(self.base_url, '/health'), timeout=5)
            if response.status_code != 200:
                print(f"❌ Server 健康检查失败: {response.status_code}")
                return False

            health = response.json()
            print(f"✅ Server 健康状态: {health}")

        except Exception as e:
            print(f"❌ 连接失败: {e}")
            print("提示: 请先运行 'python server.py' 启动 Server")
            return False

        # 2. 创建会话
        self.running = True
        self.session_id = None

        print("✅ Streamable HTTP 连接已配置")
        return True

    def disconnect(self) -> None:
        """断开连接"""
        print("\n👋 断开连接...")
        self.running = False

        if self.receive_thread:
            self.receive_thread.join(timeout=2)

        print("✅ 已断开")

    def _receive_loop(self) -> None:
        """接收循环（在后台线程运行）"""
        try:
            while self.running:
                if not self.session_id:
                    time.sleep(0.1)
                    continue

                # 发送 GET 请求接收分块响应
                response = requests.post(
                    urljoin(self.base_url, '/mcp'),
                    headers={
                        'Mcp-Session-Id': self.session_id,
                        'Mcp-Version': PROTOCOL_VERSION,
                    },
                    json={"jsonrpc": "2.0", "method": "ping", "id": -1, "params": {}},
                    stream=True,
                    timeout=30
                )

                if response.status_code != 200:
                    continue

                buffer = ""
                for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                    if not self.running:
                        break

                    if not chunk:
                        continue

                    buffer += chunk

                    # 处理完整的消息（按换行符分割）
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()
                        if line:
                            self._handle_message(line)

        except requests.exceptions.Timeout:
            if self.running:
                print("\n⚠️ 接收超时，正在重连...")
        except Exception as e:
            if self.running:
                print(f"\n❌ 接收错误: {e}")

    def _handle_message(self, message: str) -> None:
        """处理接收到的消息"""
        try:
            parsed_data = json.loads(message)

            # 检查是否是响应
            if 'id' in parsed_data and parsed_data['id'] is not None:
                request_id = parsed_data['id']

                # 忽略 ping 的响应
                if request_id == -1:
                    return

                with self.lock:
                    self.pending_responses[request_id] = parsed_data

                if 'result' in parsed_data:
                    print(f"📥 收到响应 [id={request_id}]")
                elif 'error' in parsed_data:
                    print(f"📥 收到错误 [id={request_id}]: {parsed_data['error']}")

            # 检查是否是通知
            elif 'method' in parsed_data:
                method = parsed_data['method']
                print(f"📢 收到通知: {method}")

                if method in self.message_handlers:
                    self.message_handlers[method](parsed_data.get('params', {}))

        except json.JSONDecodeError:
            print(f"⚠️ 无法解析消息: {message}")

    def send_request(self, method: str, params: Dict, timeout: int = 10) -> Dict[str, Any]:
        """发送请求并等待响应"""
        if not self.session_id:
            # 创建新会话
            self.session_id = ""

        self.request_id += 1
        request_id = self.request_id

        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params
        }

        print(f"📤 发送请求 [id={request_id}]: {method}")

        # 发送 HTTP POST 请求
        headers = {
            'Mcp-Version': PROTOCOL_VERSION,
        }
        if self.session_id:
            headers['Mcp-Session-Id'] = self.session_id

        response = requests.post(
            urljoin(self.base_url, '/mcp'),
            json=request,
            headers=headers,
            timeout=timeout
        )

        if response.status_code != 200:
            raise Exception(f"请求失败: {response.status_code}")

        # 解析响应
        try:
            response_data = response.json()
        except:
            response_data = None

        # 检查是否有 session ID
        new_session_id = response.headers.get('Mcp-Session-Id')
        if new_session_id and not self.session_id:
            self.session_id = new_session_id
            print(f"📋 收到会话 ID: {self.session_id}")

        # 检查是否是错误响应
        if response_data and 'error' in response_data:
            raise Exception(f"Server 错误: {response_data['error']}")

        return response_data.get('result', {}) if response_data else {}

    def initialize(self) -> Dict[str, Any]:
        """初始化连接"""
        print("\n🚀 步骤 1: 初始化连接")
        print("-" * 60)

        result = self.send_request("initialize", {
            "protocolVersion": PROTOCOL_VERSION,
            "clientInfo": {
                "name": "demo-http-client",
                "version": "1.0.0"
            },
            "capabilities": {}
        })

        print(f"✅ 初始化成功")
        print(f"   Server: {result.get('serverInfo', {})}")
        print(f"   Protocol: {result.get('protocolVersion')}")

        return result

    def list_tools(self) -> list:
        """获取可用工具列表"""
        print("\n🚀 步骤 2: 获取工具列表")
        print("-" * 60)

        result = self.send_request("tools/list", {})
        tools = result.get("tools", [])

        print(f"✅ 发现 {len(tools)} 个工具:")
        for tool in tools:
            print(f"   🔧 {tool['name']}: {tool['description']}")

        return tools

    def call_tool(self, name: str, arguments: Dict) -> str:
        """调用工具"""
        print(f"\n🚀 步骤 3: 调用工具 '{name}'")
        print("-" * 60)
        print(f"   参数: {arguments}")

        result = self.send_request("tools/call", {
            "name": name,
            "arguments": arguments
        })

        # 提取文本内容
        content = result.get("content", [])
        texts = []
        for item in content:
            if item.get("type") == "text":
                texts.append(item.get("text", ""))

        output = "\n".join(texts)
        print(f"✅ 结果:\n{output}")

        return output


def demo(url: str = "http://localhost:5000"):
    """完整演示流程"""
    print("=" * 60)
    print("MCP Streamable HTTP Client 演示")
    print("=" * 60)
    print(f"协议版本: {PROTOCOL_VERSION}")

    # 创建 Client
    client = MCPClient(url)

    try:
        # 1. 连接 Server
        if not client.connect():
            sys.exit(1)

        # 2. 初始化
        client.initialize()

        # 3. 获取工具列表
        tools = client.list_tools()

        # 4. 调用工具
        if any(t['name'] == 'get_weather' for t in tools):
            client.call_tool('get_weather', {'city': '北京'})
            client.call_tool('get_weather', {'city': '上海'})

        if any(t['name'] == 'get_time' for t in tools):
            client.call_tool('get_time', {})

        print("\n" + "=" * 60)
        print("✅ 所有操作完成！")

    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # 断开连接
        client.disconnect()


def interactive_mode():
    """交互模式"""
    print("=" * 60)
    print("MCP Streamable HTTP Client - 交互模式")
    print("=" * 60)
    print("命令:")
    print("  init           - 初始化连接")
    print("  list           - 获取工具列表")
    print("  weather <城市>  - 查询天气")
    print("  time           - 获取时间")
    print("  quit           - 退出")
    print("=" * 60)

    client = MCPClient("http://localhost:5000")

    if not client.connect():
        sys.exit(1)

    try:
        while True:
            try:
                cmd = input("\n> ").strip()

                if not cmd:
                    continue

                if cmd == 'quit':
                    break

                elif cmd == 'init':
                    client.initialize()

                elif cmd == 'list':
                    client.list_tools()

                elif cmd.startswith('weather '):
                    city = cmd[8:].strip()
                    client.call_tool('get_weather', {'city': city})

                elif cmd == 'time':
                    client.call_tool('get_time', {})

                else:
                    print(f"未知命令: {cmd}")

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"错误: {e}")

    finally:
        client.disconnect()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='MCP Streamable HTTP Client Demo')
    parser.add_argument('--interactive', '-i', action='store_true', help='交互模式')
    parser.add_argument('--url', '-u', default='http://localhost:5000', help='Server URL')
    args = parser.parse_args()

    if args.interactive:
        interactive_mode()
    else:
        demo(args.url)
