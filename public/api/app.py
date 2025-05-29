from fastapi import FastAPI, Body, HTTPException, UploadFile, File, Depends, status
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import sqlite3
import codecs
import json
import os
import hashlib
import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi.encoders import jsonable_encoder
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import io
import csv

app = FastAPI()

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

class ListUpdate(ListBase):
    id: int

class List(ListBase):
    id: int

    class Config:
        from_attributes = True

# 定义用户模型
class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    avatar: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    language: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(UserBase):
    password: Optional[str] = None

class User(UserBase):
    id: int
    createdAt: str
    updatedAt: Optional[str] = None

    class Config:
        from_attributes = True

# 定义登录模型
class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TokenData(BaseModel):
    username: Optional[str] = None
    user_id: Optional[int] = None

# 定义记事本模型
class NoteBase(BaseModel):
    title: str
    content: str
    userId: int

class NoteCreate(NoteBase):
    pass

class NoteUpdate(NoteBase):
    id: int

class Note(NoteBase):
    id: int
    createdAt: str
    updatedAt: str

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

# 挂载静态文件目录
# app.mount("/static", StaticFiles(directory="static"), name="static")

# 安全相关配置
SECRET_KEY = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30  # 30天过期

# 密码上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2密码Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# 获取数据库连接
# 在get_db函数中添加token字段到用户表
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
        token TEXT
    )
    """)

    # 检查token字段是否存在，如果不存在则添加
    try:
        cursor.execute("SELECT token FROM users LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE users ADD COLUMN token TEXT")

    # 创建记事本表（如果不存在）
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        userId INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users (id) ON DELETE CASCADE
    )
    """)

    # 修改activities表，添加userId字段（如果不存在）
    try:
        cursor.execute("SELECT userId FROM activities LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE activities ADD COLUMN userId INTEGER")

    conn.commit()
    return conn

# 密码哈希函数
def get_password_hash(password: str) -> str:
    """
    获取密码哈希值
    :param password: 原始密码
    :return: 哈希后的密码
    """
    return pwd_context.hash(password)

# 验证密码
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    :param plain_password: 原始密码
    :param hashed_password: 哈希后的密码
    :return: 验证结果
    """
    return pwd_context.verify(plain_password, hashed_password)

# 创建访问令牌
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    创建访问令牌
    :param data: 令牌数据
    :param expires_delta: 过期时间
    :return: 编码后的令牌
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 获取当前用户
async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    获取当前用户
    :param token: 访问令牌
    :return: 用户信息
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的身份验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        user_id: int = payload.get("user_id")
        if username is None or user_id is None:
            raise credentials_exception
        token_data = TokenData(username=username, user_id=user_id)
    except JWTError:
        raise credentials_exception

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (token_data.user_id,))
    columns = [desc[0] for desc in cursor.description]
    user = cursor.fetchone()
    conn.close()

    if user is None:
        raise credentials_exception

    user_dict = dict(zip(columns, user))
    return user_dict

@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    """
    处理图片上传请求
    :param file: 上传的文件对象
    :param current_user: 当前用户
    :return: 包含文件访问URL的JSON响应
    """
    # 确保上传目录存在
    upload_dir = "static/assets/assets/images"
    os.makedirs(upload_dir, exist_ok=True)

    # 生成唯一文件名
    file_ext = os.path.splitext(file.filename)[1]
    new_filename = f"{os.urandom(8).hex()}{file_ext}"

    # 保存上传文件
    file_path = os.path.join(upload_dir, new_filename)
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    return {"url": f"static/assets/assets/images/{new_filename}"}

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
    cursor.execute("SELECT * FROM activities WHERE id = ? AND (userId = ? OR userId IS NULL)", (list_id, current_user["id"]))
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

        # 转换为字典
        task_dict = dict(zip(columns, task_data))

        return make_response(201, {"id": list_id, "message": "任务创建成功", "task": task_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"创建任务失败: {str(e)}"})

# 更新任务
@app.put("/editlist/{list_id}")
async def update_list(list_id: int, list_data: ListUpdate, current_user: dict = Depends(get_current_user)):  # 修改参数名避免关键字冲突
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
    cursor.execute("SELECT id FROM activities WHERE id = ? AND (userId = ? OR userId IS NULL)", (list_id, current_user["id"]))
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
    cursor.execute("SELECT id FROM activities WHERE id = ? AND (userId = ? OR userId IS NULL)", (list_id, current_user["id"]))
    if cursor.fetchone() is None:
        conn.close()
        return make_response(404, {"message": f"任务ID {list_id} 不存在或无权访问"})

    try:
        cursor.execute("DELETE FROM activities WHERE id = ? AND (userId = ? OR userId IS NULL)", (list_id, current_user["id"]))
        conn.commit()
        conn.close()
        return make_response(200, {"message": "任务删除成功"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"删除任务失败: {str(e)}"})

# 获取用户设置
@app.get("/user/getsettings")
async def get_user_settings(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户的所有设置
    :param current_user: 当前用户
    :return: 用户设置
    """
    try:
        # 解析设置JSON
        settings = {}
        if "settings" in current_user and current_user["settings"]:
            try:
                settings = json.loads(current_user["settings"])
            except:
                settings = {}

        return make_response(200, settings)
    except Exception as e:
        return make_response(500, {"message": f"获取用户设置失败: {str(e)}"})

# 更新用户设置
@app.post("/user/updatesettings")
async def update_user_settings(settings: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """
    更新用户设置
    :param settings: 设置数据
    :param current_user: 当前用户
    :return: 更新结果
    """
    conn = get_db()
    cursor = conn.cursor()
    try:
        # 将设置转换为JSON字符串
        settings_json = json.dumps(settings)

        # 更新用户设置
        cursor.execute(
            "UPDATE users SET settings = ? WHERE id = ?",
            (settings_json, current_user["id"])
        )
        conn.commit()

        # 查询更新后的用户
        cursor.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        columns = [desc[0] for desc in cursor.description]
        updated_user = cursor.fetchone()
        conn.close()

        if updated_user is None:
            return make_response(404, {"message": "用户不存在"})

        # 转换为字典并移除密码
        user_dict = dict(zip(columns, updated_user))
        user_dict.pop("password", None)

        return make_response(200, {"message": "用户设置更新成功", "user": user_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"更新用户设置失败: {str(e)}"})



# ==================== 用户相关API ====================

# 用户注册
@app.post("/register")
def register_user(user: UserCreate):
    """
    用户注册
    :param user: 用户数据
    :return: 注册结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查用户名是否已存在
    cursor.execute("SELECT id FROM users WHERE username = ?", (user.username,))
    if cursor.fetchone() is not None:
        conn.close()
        return make_response(400, {"message": "用户名已存在"})

    # 哈希密码
    hashed_password = get_password_hash(user.password)

    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # 默认语言
    default_language = "zh_CN"

    try:
        # 插入用户数据
        cursor.execute(
            "INSERT INTO users (username, password, email, avatar, createdAt, updatedAt,language) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user.username, hashed_password, user.email, user.avatar, current_time, current_time, default_language)
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
        user_dict.pop("password", None)

        return make_response(201, {"message": "用户注册成功", "user": user_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"用户注册失败: {str(e)}"})

# 用户登录
@app.post("/login")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    用户登录
    :param form_data: 表单数据
    :return: 访问令牌
    """
    conn = get_db()
    cursor = conn.cursor()

    # 查询用户
    cursor.execute("SELECT * FROM users WHERE username = ?", (form_data.username,))
    columns = [desc[0] for desc in cursor.description]
    user = cursor.fetchone()

    conn.close()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 转换为字典
    user_dict = dict(zip(columns, user))
    # 验证密码
    if not verify_password(form_data.password, user_dict["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 创建访问令牌
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user_dict["username"], "user_id": user_dict["id"]},
        expires_delta=access_token_expires
    )

    # 移除密码
    user_dict.pop("password", None)

    # 解析设置JSON
    if "settings" in user_dict and user_dict["settings"]:
        try:
            user_dict["settings"] = json.loads(user_dict["settings"])
        except:
            user_dict["settings"] = {}

    # 解析设置JSON
    if "settings" in user_dict and user_dict["settings"]:
        try:
            user_dict["settings"] = json.loads(user_dict["settings"])
        except:
            user_dict["settings"] = {}

    return make_response(200, {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_dict
    })

# 获取当前用户信息
@app.get("/users/me")
async def read_users_me(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户信息
    :param current_user: 当前用户
    :return: 用户信息
    """
    return make_response(200, current_user)

# 更新用户信息
@app.put("/users/update")
async def update_user_me(user: UserUpdate, current_user: dict = Depends(get_current_user)):
    """
    更新当前用户信息
    :param user: 用户数据
    :param current_user: 当前用户
    :return: 更新结果
    """
    conn = get_db()
    cursor = conn.cursor()
    # 构建更新数据
    update_data = {}
    if user.username is not None:
        update_data["username"] = user.username
    if user.email is not None:
        update_data["email"] = user.email
    if user.avatar is not None:
        update_data["avatar"] = user.avatar
    if user.password is not None:
        update_data["password"] = get_password_hash(user.password)

    if not update_data:
        conn.close()
        return make_response(400, {"message": "没有提供更新数据"})

    try:
        # 构建SQL更新语句
        set_clause = ", ".join([f"{k} = ?" for k in update_data.keys()])
        values = list(update_data.values())
        values.append(current_user["id"])  # WHERE条件的值

        sql = f"UPDATE users SET {set_clause} WHERE id = ?"

        cursor.execute(sql, values)
        conn.commit()

        # 查询更新后的用户
        cursor.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        columns = [desc[0] for desc in cursor.description]
        updated_user = cursor.fetchone()
        conn.close()

        if updated_user is None:
            return make_response(404, {"message": "用户不存在"})

        # 转换为字典并移除密码
        user_dict = dict(zip(columns, updated_user))
        user_dict.pop("password", None)

        return make_response(200, {"message": "用户信息更新成功", "user": user_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"更新用户信息失败: {str(e)}"})

# ==================== 记事本相关API ====================

# 获取所有记事本
@app.get("/notes")
async def get_all_notes(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户的所有记事本
    :param current_user: 当前用户
    :return: 记事本列表
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM notes WHERE userId = ? ORDER BY updatedAt DESC", (current_user["id"],))
    columns = [desc[0] for desc in cursor.description]
    result = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()

    return make_response(200, result)

# 获取单个记事本
@app.get("/notes/{note_id}")
async def get_note(note_id: int, current_user: dict = Depends(get_current_user)):
    """
    获取单个记事本
    :param note_id: 记事本ID
    :param current_user: 当前用户
    :return: 记事本详情
    """
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM notes WHERE id = ? AND userId = ?", (note_id, current_user["id"]))
    columns = [desc[0] for desc in cursor.description]
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return make_response(404, {"message": f"记事本ID {note_id} 不存在或无权访问"})

    result = dict(zip(columns, row))
    return make_response(200, result)

# 创建记事本
@app.post("/note")
async def create_note(note: NoteCreate, current_user: dict = Depends(get_current_user)):
    """
    创建记事本
    :param note: 记事本数据
    :param current_user: 当前用户
    :return: 创建结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 插入记事本数据
        cursor.execute(
            "INSERT INTO notes (title, content, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?)",
            (note.title, note.content, current_time, current_time, current_user["id"])
        )
        note_id = cursor.lastrowid
        conn.commit()

        # 查询新创建的记事本
        cursor.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
        columns = [desc[0] for desc in cursor.description]
        note_data = cursor.fetchone()
        conn.close()

        if note_data is None:
            return make_response(500, {"message": "记事本创建失败"})

        return make_response(201, {"message": "记事本创建成功", "id": note_id})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"创建记事本失败: {str(e)}"})

# 更新记事本
@app.put("/notes/{note_id}")
async def update_note(note_id: int, note: NoteUpdate, current_user: dict = Depends(get_current_user)):
    """
    更新记事本
    :param note_id: 记事本ID
    :param note: 记事本数据
    :param current_user: 当前用户
    :return: 更新结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查记事本是否存在且属于当前用户
    cursor.execute("SELECT id FROM notes WHERE id = ? AND userId = ?", (note_id, current_user["id"]))
    if cursor.fetchone() is None:
        conn.close()
        return make_response(404, {"message": f"记事本ID {note_id} 不存在或无权访问"})

    # 获取当前时间
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 更新记事本数据
        cursor.execute(
            "UPDATE notes SET title = ?, content = ?, updatedAt = ? WHERE id = ? AND userId = ?",
            (note.title, note.content, current_time, note_id, current_user["id"])
        )
        conn.commit()

        # 查询更新后的记事本
        cursor.execute("SELECT * FROM notes WHERE id = ?", (note_id,))
        columns = [desc[0] for desc in cursor.description]
        updated_note = cursor.fetchone()
        conn.close()

        if updated_note is None:
            return make_response(404, {"message": "记事本不存在"})

        # 转换为字典
        note_dict = dict(zip(columns, updated_note))

        return make_response(200, {"message": "记事本更新成功", "note": note_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"更新记事本失败: {str(e)}"})

# 删除记事本
@app.delete("/notes/{note_id}")
async def delete_note(note_id: int, current_user: dict = Depends(get_current_user)):
    """
    删除记事本
    :param note_id: 记事本ID
    :param current_user: 当前用户
    :return: 删除结果
    """
    conn = get_db()
    cursor = conn.cursor()

    # 检查记事本是否存在且属于当前用户
    cursor.execute("SELECT id FROM notes WHERE id = ? AND userId = ?", (note_id, current_user["id"]))
    if cursor.fetchone() is None:
        conn.close()
        return make_response(404, {"message": f"记事本ID {note_id} 不存在或无权访问"})

    try:
        cursor.execute("DELETE FROM notes WHERE id = ? AND userId = ?", (note_id, current_user["id"]))
        conn.commit()
        conn.close()
        return make_response(200, {"message": "记事本删除成功"})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"删除记事本失败: {str(e)}"})

# 修改任务API，添加用户认证
@app.get("/lists")
async def get_all_list(current_user: dict = Depends(get_current_user)):
    """
    查询当前用户的所有任务
    :param current_user: 当前用户
    :return: 任务列表
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activities WHERE userId = ? OR userId IS NULL", (current_user["id"],))
    columns = [desc[0] for desc in cursor.description]
    result = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return make_response(200, result)

# 不需要token验证的获取活动列表API
@app.get("/public/lists")
async def get_public_lists():
    """
    获取所有公开活动列表，不需要用户认证
    :return: 活动列表
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activities")
    columns = [desc[0] for desc in cursor.description]
    result = [dict(zip(columns, row)) for row in cursor.fetchall()]
    conn.close()
    return make_response(200, result)

# 导出活动列表为Excel（CSV格式）
@app.get("/export/lists")
async def export_lists(current_user: dict = Depends(get_current_user)):
    """
    导出当前用户的活动列表为CSV格式
    :param current_user: 当前用户
    :return: CSV文件内容
    """
    from fastapi.responses import StreamingResponse
    import io
    import csv

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activities WHERE userId = ? OR userId IS NULL", (current_user["id"],))
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    conn.close()

    # 创建CSV文件
    output = io.StringIO()
    writer = csv.writer(output)

    # 写入表头
    headers = ["活动ID", "活动名称", "活动日期", "活动状态", "活动地点", "活动备注", "分类ID"]
    writer.writerow(headers)

    # 写入数据行
    for row in rows:
        row_dict = dict(zip(columns, row))
        writer.writerow([
            row_dict.get("id", ""),
            row_dict.get("name", ""),
            row_dict.get("date", ""),
            row_dict.get("status", ""),
            row_dict.get("address", ""),
            row_dict.get("remark", ""),
            row_dict.get("categoryId", "")
        ])

    # 重置文件指针到开始位置
    output.seek(0)

    # 返回CSV文件
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=activities_{current_user['id']}.csv"
        }
    )

@app.get("/", response_class=HTMLResponse)
def root():
    """
    根路径路由，返回index.html网页内容
    """
    with open("static/index.html", "r", encoding="utf-8") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)

@app.post("/validate_token")
async def validate_token(token: str = Depends(oauth2_scheme)) -> bool:
    """
    验证令牌是否有效
    :param token: 需要验证的令牌
    :return: 如果令牌有效返回True，否则返回False
    """
    try:
        # 解码令牌以检查其有效性
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # 将 exp 转换为 datetime 对象
        exp = datetime.utcfromtimestamp(payload.get("exp"))
        # 检查令牌是否过期
        if exp < datetime.utcnow():
            return False
        return make_response(200, {"message": "验证成功"})
    except JWTError:
        # 如果解码失败，令牌无效
        return make_response(500, {"message": "令牌无效"})



# 设置用户token
@app.post("/user/set_token")
async def set_user_token(token: str, current_user: dict = Depends(get_current_user)):
    """
    设置用户token
    :param token: 用户token
    :param current_user: 当前用户
    :return: 设置结果
    """
    conn = get_db()
    cursor = conn.cursor()
    try:
        # 更新用户token
        cursor.execute(
            "UPDATE users SET token = ? WHERE id = ?",
            (token, current_user["id"])
        )
        conn.commit()

        # 查询更新后的用户
        cursor.execute("SELECT * FROM users WHERE id = ?", (current_user["id"],))
        columns = [desc[0] for desc in cursor.description]
        updated_user = cursor.fetchone()
        conn.close()

        if updated_user is None:
            return make_response(404, {"message": "用户不存在"})

        # 转换为字典并移除密码
        user_dict = dict(zip(columns, updated_user))
        user_dict.pop("password", None)

        return make_response(200, {"message": "用户token设置成功", "user": user_dict})
    except Exception as e:
        conn.rollback()
        conn.close()
        return make_response(500, {"message": f"设置用户token失败: {str(e)}"})

# 验证用户token
@app.post("/user/validate_token")
async def validate_user_token(token: str):
    """
    验证用户token是否有效
    :param token: 用户token
    :return: 验证结果
    """
    conn = get_db()
    cursor = conn.cursor()
    try:
        # 查询用户
        cursor.execute("SELECT * FROM users WHERE token = ?", (token,))
        columns = [desc[0] for desc in cursor.description]
        user = cursor.fetchone()
        conn.close()

        if user is None:
            return make_response(401, {"message": "无效的token"})

        # 转换为字典并移除密码
        user_dict = dict(zip(columns, user))
        user_dict.pop("password", None)

        return make_response(200, {"message": "token验证成功", "user": user_dict})
    except Exception as e:
        conn.close()
        return make_response(500, {"message": f"验证token失败: {str(e)}"})


