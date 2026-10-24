# 本地构建、私有镜像仓库搭建与代码迭代推送指南

本文档面向本地二次开发（如修改 `dof-frida` 插件模块、容器初始化脚本等）并推送至局域网 NAS 或测试服务器部署的完整闭环流程。

---

## 目录

1. [整体开发与部署工作流](#1-整体开发与部署工作流)
2. [搭建与管理本地私有镜像仓库 (Registry)](#2-搭建与管理本地私有镜像仓库-registry)
3. [首次完整构建本地 Docker 镜像](#3-首次完整构建本地-docker-镜像)
4. [日常修改代码后的增量重打包与推送](#4-日常修改代码后的增量重打包与推送)
5. [NAS / 局域网机器拉取与部署测试](#5-nas--局域网机器拉取与部署测试)
6. [仓库维护与常见问题排查](#6-仓库维护与常见问题排查)

---

## 1. 整体开发与部署工作流

```text
[开发机: 修改 dof-frida / 容器脚本]
        │
        ▼ (同步至 build/dnf_data/home/template/init/frida/)
[开发机: docker build 增量构建镜像]
        │
        ▼ (docker push 127.0.0.1:5000/...)
[开发机: 本地私有镜像仓库 registry:2 (监听 0.0.0.0:5000)]
        │
        ▼ (局域网 / Tailscale 拉取 <开发机IP>:5000/...)
[NAS / 测试机: docker compose pull && docker compose up -d]
```

---

## 2. 搭建与管理本地私有镜像仓库 (Registry)

使用官方 `registry:2` 镜像即可在本机快速搭建轻量级私有镜像仓库。

### 2.1 启动本地镜像仓库

选择一个磁盘空间充裕的目录作为镜像数据持久化目录（例如 `/home/susu/docker/registry`）：

```bash
# 1. 创建本地持久化存储目录
mkdir -p /home/susu/docker/registry

# 2. 启动 registry:2 容器（开机自启，开启镜像删除支持）
docker run -d \
  --restart=always \
  -p 5000:5000 \
  --name dnf-local-registry \
  -e REGISTRY_STORAGE_DELETE_ENABLED=true \
  -v /home/susu/docker/registry:/var/lib/registry \
  registry:2
```

### 2.2 验证仓库运行状态

```bash
# 查看仓库中的所有镜像名
curl -fsS http://127.0.0.1:5000/v2/_catalog

# 查看指定镜像下已推送的 Tag 列表
curl -fsS http://127.0.0.1:5000/v2/llnut/dnf/tags/list
```

> **提示**：Docker 默认信任本机回环地址 `127.0.0.1:5000` 和 `localhost:5000`，因此**在开发机本机推送镜像时，直接使用 `127.0.0.1:5000/...` 即可，无需修改开发机的 `/etc/docker/daemon.json` 或重启 Docker 服务**。而其他局域网机器（如 NAS）则通过 `<开发机局域网IP>:5000/...` 拉取同一份镜像。

### 2.3 迁移本地仓库存储目录（可选）

如果后续需要更换存储路径（例如从旧目录迁移到新目录 `/new/path/registry`）：

```bash
# 1. 停止并移除旧容器（数据在宿主机目录中不会丢失）
docker rm -f dnf-local-registry

# 2. 移动数据目录
mv /home/susu/docker/registry /new/path/registry

# 3. 挂载新目录重新启动容器
docker run -d \
  --restart=always \
  -p 5000:5000 \
  --name dnf-local-registry \
  -e REGISTRY_STORAGE_DELETE_ENABLED=true \
  -v /new/path/registry:/var/lib/registry \
  registry:2
```

---

## 3. 首次完整构建本地 Docker 镜像

本项目镜像采用分层构建架构（以推荐的 `debian13` 为例）：

| 构建顺序 | Dockerfile 路径 | 产出本地 Tag | 说明 |
| :--- | :--- | :--- | :--- |
| **第 1 层** | `build/debian13/Dockerfile.base` | `llnut/dnf:debian13-base` | Debian 基础环境与时区/运行库软链 |
| **第 2 层** | `build/debian13/Dockerfile.db` | `llnut/dnf:debian13-db` | 基于 `base`，内置 MySQL 5.7 服务端与客户端 |
| **第 3 层 (推荐)** | `build/debian13/Dockerfile.full` | `llnut/dnf:debian13-qf1031-latest` | 基于 `db`，内置游戏服务端 + 网关 + `dof-frida`（单容器一体部署） |
| **第 3 层 (可选)** | `build/debian13/Dockerfile.server` | `llnut/dnf:debian13-server-qf1031-latest` | 基于 `base`，不含本地 `mysqld`（仅用于端库分离部署） |

在项目根目录下依次执行以下命令完成首次构建：

```bash
# 第 1 步：构建 base 基础层
docker build -f build/debian13/Dockerfile.base \
  -t llnut/dnf:debian13-base .

# 第 2 步：构建 db 数据库层
docker build -f build/debian13/Dockerfile.db \
  --build-arg BASE_TAG=debian13-base \
  -t llnut/dnf:debian13-db \
  -t llnut/dnf:debian13-db-latest .

# 第 3 步：构建 full 完整一体端镜像（单机 / NAS 推荐）
docker build -f build/debian13/Dockerfile.full \
  --build-arg DB_TAG=debian13-db \
  -t llnut/dnf:debian13-qf1031-latest .
```

首次推送到本地私有镜像仓库：

```bash
# 打上本地仓库 Tag 并推送
docker tag llnut/dnf:debian13-qf1031-latest 127.0.0.1:5000/llnut/dnf:debian13-qf1031-latest
docker push 127.0.0.1:5000/llnut/dnf:debian13-qf1031-latest

# （可选）如果使用端库分离部署，也推送 db 镜像
docker tag llnut/dnf:debian13-db-latest 127.0.0.1:5000/llnut/dnf:debian13-db-latest
docker push 127.0.0.1:5000/llnut/dnf:debian13-db-latest
```

---

## 4. 日常修改代码后的增量重打包与推送

### 方式一：仅在测试环境快速热调 Frida 脚本（无需重打镜像）

容器启动时会自动将镜像内的 `dof-frida` 同步到挂载卷 `./data/frida/`，并建立 `/plugins/frida -> /data/frida` 软链接：
- 若只是临时调试模块逻辑或修改 `frida_config.json`（如增删 `gmCid`、开关模块），可直接编辑 NAS 挂载目录 `./data/frida/` 下对应的文件。
- 游戏内使用 GM 角色在聊天框输入：
  - `//reload`：热重载所有未冻结的功能模块；
  - `//reload 模块名`：仅热重载指定模块；
  - `//reload cfg`：重新读取 `frida_config.json`、重载基础模块及所有功能模块。

### 方式二：在本机修改代码并重新打包推送新镜像（标准发版流程）

当你在本机修改了 `dof-frida/` 源码或 `build/dnf_data/` 下的启动脚本，需要将改动正式打包进 Docker 镜像推送到仓库时，由于前面的 `base`、`db`、Rust 编译层全部命中 Docker 缓存，**重新打包仅需几秒钟**。

在项目根目录下执行以下完整命令：

```bash
# 1. 将 dof-frida 最新代码同步至 Docker 镜像模板目录（排除 .git、Symbols.txt、frida.so 等开发文件）
rm -rf build/dnf_data/home/template/init/frida
mkdir -p build/dnf_data/home/template/init/frida
cp -a dof-frida/frida.js \
      dof-frida/frida_config.json \
      dof-frida/lib \
      dof-frida/module \
      build/dnf_data/home/template/init/frida/
chmod -R a+rX build/dnf_data/home/template/init/frida

# 2.（可选推荐）如果修改了容器初始化 Shell 脚本，运行项目自带单元测试验证
bash .github/scripts/run-shell-tests.sh

# 3. 增量重新构建 full 镜像（自动复用前置缓存层）
docker build -f build/debian13/Dockerfile.full \
  --build-arg DB_TAG=debian13-db \
  -t llnut/dnf:debian13-qf1031-latest .

# 4. 打 Tag 并推送到本地镜像仓库
docker tag llnut/dnf:debian13-qf1031-latest 127.0.0.1:5000/llnut/dnf:debian13-qf1031-latest
docker push 127.0.0.1:5000/llnut/dnf:debian13-qf1031-latest
```

> **提示（容器升级时的自动同步与备份机制）**：
> 容器内的 `init-data.sh` 通过 `sync_template_file` 维护 `/data/frida/` 与 `/data/.frida-template/`：
> - 当新镜像中的模块文件发生变化时，容器重启会自动将新版本更新到 `/data/frida/`；
> - 若你在 NAS 本地手工修改过某个文件（如自定义的 `frida_config.json`），新镜像升级该文件时会**自动将你的旧文件备份为 `.bak`** 后再写入新版，避免配置丢失；未随镜像变动的文件则会保留你的自定义修改。

---

## 5. NAS / 局域网机器拉取与部署测试

假设开发机的局域网 IP 为 `192.168.8.185`（若跨网段使用 Tailscale，则替换为开发机的 Tailscale IP）。

### 5.1 在 NAS 上配置信任 HTTP 私有镜像仓库

由于局域网私有仓库默认使用 HTTP 协议，首次使用前需在 NAS 的 Docker 配置中添加 `insecure-registries`：

- **图形界面配置（群晖 Container Manager / 飞牛 fnOS / 威联通 / 绿联等）**：
  进入 **Docker（容器管理） -> 镜像仓库 / 注册表设置**，新增或编辑不安全注册表（Insecure Registry），填入：`192.168.8.185:5000`。
- **SSH 命令行配置**：
  编辑 NAS 上的 `/etc/docker/daemon.json`（若文件已存在则合并字段）：
  ```json
  {
    "insecure-registries": ["192.168.8.185:5000"]
  }
  ```
  保存后重启 NAS 的 Docker 服务：`sudo systemctl restart docker`。

### 5.2 检查 NAS 的 Docker 版本（Docker 29+ 必看）

如果 NAS 上的 Docker 主版本 **≥ 29**，默认 `seccomp` 策略会导致游戏频道报 `Could not create a UDP socket : 38`。请先在 NAS 上下载兼容配置文件：

```bash
sudo mkdir -p /etc/docker
sudo curl -fsSL https://raw.githubusercontent.com/moby/profiles/refs/tags/seccomp/v0.2.1/seccomp/default.json \
  -o /etc/docker/seccomp-profile-v0.2.1.json
```

并在下方 `docker-compose.yaml` 中取消 `security_opt` 的注释（Docker 28 及以下版本无需此步）。

### 5.3 编写 `docker-compose.yaml` 并启动

在 NAS 上新建部署目录（如 `/vol1/1000/docker/dnf`），创建 `docker-compose.yaml`：

```yaml
version: "2.3"

services:
  dnf-1:
    hostname: dnf-1
    image: 192.168.8.185:5000/llnut/dnf:debian13-qf1031-latest
    stop_grace_period: 30s
    # 若 NAS 的 Docker 版本 >= 29，请取消下面两行注释：
    # security_opt:
    #   - seccomp=/etc/docker/seccomp-profile-v0.2.1.json
    environment:
      - TZ=Asia/Shanghai
      - SERVER_GROUP=3
      - SERVER_GROUP_DB=cain
      - DNF_DB_ROOT_PASSWORD=88888888
      - GATE_AES_KEY=a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345
      # 务必修改为 NAS 自身的局域网 IP（客户端连接该 IP）
      - PUBLIC_IP=192.168.8.xxx
      - OPEN_CHANNEL=11,52
    # shm_size 不可省略，默认 64M 会导致服务端异常
    shm_size: 1g
    memswap_limit: -1
    mem_limit: 4g
    restart: always
    ports:
      - 3000:4000/tcp             # MySQL 外部连接端口（账号 root，密码为 DNF_DB_ROOT_PASSWORD）
      - 5505:5505/tcp             # dnf-gate-server 登录器 HTTP 端口
      - 7001:7001/tcp             # df_channel_r
      - 7001:7001/udp
      - 7300:7300/tcp             # df_relay_r
      - 7300:7300/udp
      - 30011:30011/tcp           # df_game_r [11频道]
      - 31011:31011/udp
      - 30052:30052/tcp           # df_game_r [52频道]
      - 31052:31052/udp
      - 2311-2313:2311-2313/udp   # df_stun_r
    volumes:
      - ./data:/data
      - ./mysql:/var/lib/mysql
      - ./log:/home/neople/game/log
```

启动与后续拉取更新命令：

```bash
# 首次启动
docker compose up -d

# 后续开发机推送新镜像后，在 NAS 上一键拉取最新镜像并重建容器
docker compose pull && docker compose up -d
```

### 5.4 验证启动状态与 Frida 插件

1. **查看频道就绪日志**：
   ```bash
   docker compose logs -f
   ```
   看到 `s6-rc: info: service game_siroco11 successfully started` 即表示游戏服务端启动完成。
2. **查看 `dof-frida` 运行日志**：
   直接查看挂载目录 `./data/frida/log/frida_siroco11_年_月_日.log`，看到 `ALL modules loaded` 即说明所有模块挂载成功。
3. **设置 GM 权限**：
   编辑 `./data/frida/frida_config.json` 中的 `"gmCid": [1, 你的角色charac_no]`，进游戏输入 `//reload cfg` 后发送 `//help` 即可查看全部 GM 指令。

---

## 6. 仓库维护与常见问题排查

### 6.1 清理私有仓库历史无用镜像块（垃圾回收）

多次重新打包推送同一 Tag（如 `debian13-qf1031-latest`）后，旧层的未引用数据块仍会保留在仓库目录中。可在开发机执行垃圾回收释放磁盘空间：

```bash
docker exec dnf-local-registry bin/registry garbage-collect /etc/docker/registry/config.yml --delete-untagged
```

### 6.2 常见报错排查

- **NAS 拉取报 `http: server gave HTTP response to HTTPS client`**：
  说明 NAS 的 Docker 尚未配置 `insecure-registries` 或修改后未重启 NAS 的 Docker 服务，请检查 [5.1 节](#51-在-nas-上配置信任-http-私有镜像仓库)。
- **NAS 拉取报 `connection refused` 或超时**：
  1. 确认开发机上的 `dnf-local-registry` 正在运行：`docker ps | grep dnf-local-registry`；
  2. 确认开发机防火墙放行了 `5000/tcp` 端口，并在 NAS 上测试连通性：`curl http://<开发机IP>:5000/v2/_catalog`。
