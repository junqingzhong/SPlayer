from fastapi import FastAPI, Body, HTTPException, UploadFile, File, Depends, status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm,HTTPBearer, HTTPAuthorizationCredentials
import sqlite3
import json
import os
import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi.encoders import jsonable_encoder
from passlib.context import CryptContext
from datetime import datetime
from fastapi import Cookie, HTTPException
import io
import csv

app = FastAPI()
security = HTTPBearer()
# 添加CORS中间件，允许跨域请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头部
)

# 定义任务模型
class ListBase(BaseModel):
    name: str
    date: str
    status: str
    categoryId: int
    remark: Optional[str] = None
    address: Optional[str] = None
    userId: Optional[int] = None

class ListCreate(ListBase):
    pass

class List(ListBase):
    id: int

    class Config:
        from_attributes = True

# 定义用户模型
class UserBase(BaseModel):
    username: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    cookie: Optional[str] = None

class User(UserBase):
    id: int
    createdAt: str
    updatedAt: Optional[str] = None

    class Config:
        from_attributes = True

def make_response(status: int, data):
    """
    统一返回格式方法
    :param status: 状态码（如200）
    :param data: 返回的数据内容
    :return: JSONResponse 直接指定编码
    """
    json_compatible_data = jsonable_encoder(data)
    return JSONResponse(
        content={"status": status, "data": json_compatible_data},
        headers={"Content-Type": "application/json; charset=utf-8"}  # 强制指定编码
    )

# Cookie验证配置
COOKIE_NAME = "session_cookie"

# 获取数据库连接
def get_db():
    """
    获取sqlite3数据库连接
    """
    conn = sqlite3.connect("./activities.db")
    # 强制指定连接编码
    conn.text_factory = lambda x: str(x, 'utf-8', 'ignore')  # 新增编码处理
    # 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON")
    # 设置文本工厂，确保正确处理UTF-8编码
    conn.text_factory = str

    # 确保表存在
    cursor = conn.cursor()

    # 创建用户表（如果不存在）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        avatar TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT,
        settings TEXT,
        language TEXT,
        token TEXT,
        backgroundImage TEXT,
        cookie TEXT
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS activities (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NULL,
        "date" TEXT NULL,
        "status" TEXT NULL,
        "modified" TINYINT NULL,
        "sync_status" TEXT NULL,
        "remark" TEXT NULL,
        "address" TEXT NULL,
        "categoryId" INTEGER NULL,
        "userId" INTEGER NULL,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    return conn

# 获取当前用户
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    通过Cookie获取当前用户
    :param cookie: 会话Cookie
    :return: 用户信息
    """
    cookie = credentials.credentials;
     # 从 Cookie 获取
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(f"SELECT id,username,cookie,updatedAt,settings FROM users WHERE cookie = ?", (cookie,))
    columns = [desc[0] for desc in cursor.description]
    user = cursor.fetchone()
    conn.close()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的Token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # 将查询结果元组转换为字典
    user = dict(zip(columns, user))

    # 如果settings字段是JSON字符串，则反序列化为字典
    if 'settings' in user and isinstance(user['settings'], str):
        try:
            user['settings'] = json.loads(user['settings'])
        except json.JSONDecodeError:
            # 如果JSON解析失败，设置为默认空字典
            user['settings'] = {}
    elif 'settings' not in user or user['settings'] is None:
        # 如果settings字段不存在或为None，设置为默认空字典
        user['settings'] = {}

    return user

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    处理图片上传请求
    :param file: 上传的文件对象
    :return: 包含文件访问URL的JSON响应
    """
    # 确保上传目录存在
    upload_dir = "/usr/share/nginx/html/static/images"
    os.makedirs(upload_dir, exist_ok=True)

    # 生成唯一文件名
    file_ext = os.path.splitext(file.filename)[1]
    new_filename = f"{os.urandom(8).hex()}{file_ext}"

    # 保存上传文件
    file_path = os.path.join(upload_dir, new_filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    return make_response(200, {"url": f"/static/images/{new_filename}"})

# 根据ID获取单个任务
@app.get("/list/{list_id}")
async def get_list(list_id: int, current_user: dict = Depends(get_current_user)):
    """
    根据ID获取单个任务
    :param list_id: 任务ID
    :param current_user: 当前用户
    :return: 任务详情
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activities WHERE id = ? AND userId = ?", (list_id, current_user["id"]))
    columns = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return make_response(404, {"message": f"任务ID {list_id} 不存在或无权访问"})

    result = dict(zip(columns, row))
    return make_response(200, result)

# 创建新任务
@app.post("/addlist")
async def create_list(list_data: ListCreate, current_user: dict = Depends(get_current_user)):
    """
    创建新任务
    :param list_data: 任务数据
    :param current_user: 当前用户
    :return: 创建的任务ID
    """
    conn = get_db()
    cursor = conn.cursor()

    # 将任务数据转换为字典
    list_data = list_data.dict()

    # 设置用户ID
    list_data["userId"] = current_user["id"]

    # 构建SQL插入语句
    columns = ", ".join(list_data.keys())
    placeholders = ", ".join(["?" for _ in list_data])
    values = list(list_data.values())

    sql = f"INSERT INTO activities ({columns}) VALUES ({placeholders})"

    try:
        cursor.execute(sql, values)
        list_id = cursor.lastrowid
        conn.commit()

        # 查询新创建的任务
        cursor.execute("SELECT * FROM activities WHERE id = ?", (list_id,))
        columns = [desc[0] for desc in cursor.description]
        task_data = cursor.fetchone()
        conn.close()

        if task_data is None:
            return make_response(500, {"message": "任务创建失败"})

        return make_response(200, {"id": list_id, "message": "任务创建成功"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"创建任务失败: {str(e)}"})

# 更新任务
@app.put("/editlist/{list_id}")
async def update_list(list_id: int, list_data: ListBase, current_user: dict = Depends(get_current_user)):
    """
    更新任务
    :param list_id: 任务ID
    :param list_data: 更新的任务数据（ListUpdate对象）
    :param current_user: 当前用户
    :return: 更新结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查任务是否存在且属于当前用户
    cursor.execute("SELECT id FROM activities WHERE id = ? AND userId = ?", (list_id, current_user["id"]))
    if cursor.fetchone() is None:
        conn.close()
        return make_response(404, {"message": f"任务ID {list_id} 不存在或无权访问"})

    try:
        # 将Pydantic模型转换为字典
        update_data = list_data.dict(exclude={"id"})

        # 确保userId字段为当前用户ID
        update_data["userId"] = current_user["id"]

        # 构建SQL更新语句
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(list_id)  # WHERE条件的值放在最后

        sql = f"UPDATE activities SET {set_clause} WHERE id = ?"

        cursor.execute(sql, values)
        conn.commit()

        # 查询更新后的任务
        cursor.execute("SELECT * FROM activities WHERE id = ?", (list_id,))
        columns = [desc[0] for desc in cursor.description]
        updated_task = cursor.fetchone()

        if updated_task is None:
            return make_response(404, {"message": "任务不存在"})

        # 转换为字典
        task_dict = dict(zip(columns, updated_task))

        return make_response(200, {"message": "任务更新成功", "task": task_dict})

    except Exception as e:
        conn.rollback()
        return make_response(500, {"message": f"更新失败: {str(e)}"})
    finally:
        conn.close()

# 删除任务
@app.delete("/dellist/{list_id}")
async def delete_list(list_id: int, current_user: dict = Depends(get_current_user)):
    """
    删除任务
    :param list_id: 任务ID
    :param current_user: 当前用户
    :return: 删除结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查任务是否存在且属于当前用户
    cursor.execute("SELECT id FROM activities WHERE id = ? AND userId = ?", (list_id, current_user["id"]))
    if cursor.fetchone() is None:
        conn.close()
        return make_response(404, {"message": f"任务ID {list_id} 不存在或无权访问"})

    try:
        cursor.execute("DELETE FROM activities WHERE id = ? AND userId = ?", (list_id, current_user["id"]))
        conn.commit()
        conn.close()
        return make_response(200, {"message": "任务删除成功"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"删除任务失败: {str(e)}"})

# 删除用户
@app.delete("/deluser/{user_id}")
async def delete_user(user_id: int):
     """
    删除用户
    :param user_id: 用户ID
    :return: 删除结果
    """
     if user_id == 1:
        return make_response(403, {"message": "超级管理员，不能删除"})

     conn = get_db()
     cursor = conn.cursor()

     try:
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        conn.close()
        return make_response(200, {"message": "用户删除成功"})
     except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"删除用户失败: {str(e)}"})
# 用户注册
@app.post("/register")
def register_user(user: UserBase,current_user: dict = Depends(get_current_user)):
    """
    用户注册
    :param user: 用户数据
    :return: 注册结果
    """

    if(current_user["id"]!= 1):
        return make_response(403, {"message": "您无权注册用户"})

    conn = get_db()
    cursor = conn.cursor()

    # 检查 cookie 是否已存在
    if user.cookie:
        cursor.execute("SELECT id FROM users WHERE cookie = ?", (user.cookie,))
        if cursor.fetchone() is not None:
            conn.close()
            return make_response(400, {"message": "用户已存在 (相同的cookie)"})

    # 检查用户名是否已存在
    cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone() is not None:
        conn.close()
        return make_response(400, {"message": "用户名已存在"})

    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 插入用户数据
        cursor.execute(
            "INSERT INTO users (username, createdAt, updatedAt, cookie) VALUES (?, ?, ?, ?)",
            (user.username,current_time, current_time, user.cookie )
        )
        user_id = cursor.lastrowid
        conn.commit()

        # 查询新创建的用户
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        columns = [desc[0] for desc in cursor.description]
        user_data = cursor.fetchone()
        conn.close()

        if user_data is None:
            return make_response(500, {"message": "用户创建失败"})

        # 转换为字典并移除密码
        user_dict = dict(zip(columns, user_data))
        return make_response(201, {"message": "用户创建成功", "user": user_dict})

    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"用户创建失败: {str(e)}"})

# 获取所有用户信息
@app.get("/users")
async def read_users(current_info = False,current_user: dict = Depends(get_current_user)):
    """
    获取所有用户信息
    :param current_user: 当前用户 只有id ==1 才有权限
    :return: 用户信息
    """
    if current_user["id"] != 1 or current_info:
        return make_response(200, [current_user])

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(f"SELECT id,username,cookie,updatedAt,settings FROM users")
    columns = [desc[0] for desc in cursor.description]
    users_data = cursor.fetchall()
    conn.close()

    result = []
    # 循环处理每个用户数据
    for user_data in users_data:
        # 将查询结果转换为字典
        user_dict = dict(zip(columns, user_data))
        # 如果settings字段是JSON字符串，则反序列化为字典
        if 'settings' in user_dict and isinstance(user_dict['settings'], str):
            try:
                user_dict['settings'] = json.loads(user_dict['settings'])
            except json.JSONDecodeError:
                # 如果JSON解析失败，设置为默认空字典
                user_dict['settings'] = {}
        elif 'settings' not in user_dict or user_dict['settings'] is None:
                # 如果settings字段不存在或为None，设置为默认空字典
                user_dict['settings'] = {}

        result.append(user_dict)

    return make_response(200, result)

# 更新用户信息
@app.put("/user/{user_id}")
async def update_user(user_id: int ,User_update: UserBase,current_user: dict = Depends(get_current_user)):
    """
    更新用户信息
    :param current_user: 当前用户
    :return: 用户信息
    """

    if current_user["id"]!= 1 and current_user["id"]!= user_id:
        return make_response(403, {"message": "您无权修改此用户"})

    conn = get_db()
    cursor = conn.cursor()

    # 检查用户是否存在
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    columns = [desc[0] for desc in cursor.description]
    user = cursor.fetchone()
    if user is None:
        conn.close()
        return make_response(404, {"message": f"用户ID {user_id} 不存在"})

    # 检查传入的 cookie 是否已存在于其他用户
    if User_update.cookie:
        cursor.execute("SELECT id FROM users WHERE cookie = ?", (User_update.cookie,))
        if cursor.fetchone() is not None:
            conn.close()
            return make_response(400, {"message": "Cookie 已被其他用户使用"})

    # 检查传入的 name 是否已存在于其他用户
    if User_update.username:
        cursor.execute("SELECT id FROM users WHERE username = ?", (User_update.username,))
        if cursor.fetchone() is not None:
            conn.close()
            return make_response(400, {"message": "用户名已存在"})

    try:
        update_data = User_update.dict(exclude_unset=True) # 使用exclude_unset=True只更新提供的字段

        # 如果settings存在且为字典，则将其转换为JSON字符串
        if 'settings' in update_data and isinstance(update_data['settings'], dict):
            update_data['settings'] = json.dumps(update_data['settings'])

        # 增加updatedAt字段的自动更新
        update_data['updatedAt'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # 构建SQL更新语句
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(user_id)  # WHERE条件的值放在最后

        sql = f"UPDATE users SET {set_clause} WHERE id = ?"

        cursor.execute(sql, values)
        conn.commit()

        return make_response(200, {"message": "用户信息更新成功"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"更新失败: {str(e)}"})

# 修改任务API，添加用户认证，只返回用户自己的内容
@app.get("/lists")
async def get_all_list(current_user: dict = Depends(get_current_user)):
    """
    查询当前用户的所有任务
    :param current_user: 当前用户
    :return: 任务列表
    """
    conn = get_db()
    cursor = conn.cursor()
    # 只查询当前用户的任务
    cursor.execute("SELECT * FROM activities WHERE userId = ?", (current_user["id"],))
    columns = [desc[0] for desc in cursor.description]
    result = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return make_response(200, {"activities": result, "user": current_user})

# 更新活动状态
@app.put("/update_activity_status/{activity_id}")
async def update_activity_status(activity_id: int, status: str, current_user: dict = Depends(get_current_user)):
    """
    更新活动状态
    :param activity_id: 活动ID
    :param status: 新状态
    :param current_user: 当前用户
    :return: 更新结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查活动是否存在
    cursor.execute("SELECT * FROM activities WHERE id = ?", (activity_id,))
    columns = [desc[0] for desc in cursor.description]
    activity = cursor.fetchone()

    if activity is None:
        conn.close()
        return make_response(404, {"message": f"活动ID {activity_id} 不存在"})

    # 转换为字典
    activity_dict = dict(zip(columns, activity))

    # 检查活动是否属于当前用户
    if activity_dict.get("userId") is not None and activity_dict.get("userId") != current_user["id"]:
        conn.close()
        return make_response(403, {"message": "您无权更新此活动的状态"})

    try:
        # 更新活动状态
        cursor.execute(
            "UPDATE activities SET status = ? WHERE id = ?",
            (status, activity_id)
        )
        conn.commit()

        # 查询更新后的活动
        cursor.execute("SELECT * FROM activities WHERE id = ?", (activity_id,))
        columns = [desc[0] for desc in cursor.description]
        updated_activity = cursor.fetchone()
        conn.close()

        if updated_activity is None:
            return make_response(404, {"message": "活动不存在"})

        # 转换为字典
        activity_dict = dict(zip(columns, updated_activity))

        return make_response(200, {"message": "活动状态更新成功", "activity": activity_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"更新失败: {str(e)}"})


