// 无 GL 环境下的 14 个「陷阱桩」。
//
// 背景：ive2glb 只读 IVE 场景图并导出顶点数据，从不渲染，因此 OpenGL 永远不会被调用。
// 但 OSG 的 osg / osgText / osgSim / osgFX 等静态库里编译进了立即模式、显示列表与像素
// 传输的调用点，链接时必须给出定义。emscripten 的 -sLEGACY_GL_EMULATION=1 覆盖了其中
// 大部分，剩下这 14 个 WebGL 无法实现的入口点（详见 native/ive2glb/WASM-SPIKE.md）。
//
// 这里**只补齐定义、不做静默空实现**：一旦真被调用就打印中文错误并以退出码 3 终止。
// 这样可以保证「渲染路径被误触发」会立刻暴露，而不是悄悄产出错误的几何数据。
//
// 原型照抄 emscripten sysroot 的 GL/gl.h，避免与调用方签名不一致。

#include <GL/gl.h>

#include <cstdio>
#include <cstdlib>

namespace {

[[noreturn]] void trapGlCall(const char* name) {
  std::fprintf(stderr,
               "ive2glb(wasm)：不支持的 OpenGL 调用 %s。\n"
               "本助手只做只读转换，不应触达渲染路径；出现此提示说明场景遍历用到了\n"
               "WebGL 无法实现的立即模式/显示列表/像素传输功能，请报告该模型。\n",
               name);
  std::fflush(stderr);
  std::exit(3);
}

}  // namespace

extern "C" {

void GLAPIENTRY glNewList(GLuint, GLenum) { trapGlCall("glNewList"); }
void GLAPIENTRY glEndList(void) { trapGlCall("glEndList"); }
void GLAPIENTRY glCallList(GLuint) { trapGlCall("glCallList"); }
void GLAPIENTRY glDeleteLists(GLuint, GLsizei) { trapGlCall("glDeleteLists"); }
GLuint GLAPIENTRY glGenLists(GLsizei) { trapGlCall("glGenLists"); }

void GLAPIENTRY glDrawPixels(GLsizei, GLsizei, GLenum, GLenum, const GLvoid*) {
  trapGlCall("glDrawPixels");
}
void GLAPIENTRY glRasterPos3f(GLfloat, GLfloat, GLfloat) { trapGlCall("glRasterPos3f"); }
void GLAPIENTRY glGetTexImage(GLenum, GLint, GLenum, GLenum, GLvoid*) {
  trapGlCall("glGetTexImage");
}
void GLAPIENTRY glGetLightfv(GLenum, GLenum, GLfloat*) { trapGlCall("glGetLightfv"); }

void GLAPIENTRY glColor3dv(const GLdouble*) { trapGlCall("glColor3dv"); }
void GLAPIENTRY glColor4dv(const GLdouble*) { trapGlCall("glColor4dv"); }
void GLAPIENTRY glNormal3bv(const GLbyte*) { trapGlCall("glNormal3bv"); }
void GLAPIENTRY glNormal3dv(const GLdouble*) { trapGlCall("glNormal3dv"); }
void GLAPIENTRY glNormal3sv(const GLshort*) { trapGlCall("glNormal3sv"); }

// 固定管线光照/材质/栅格状态（第二批，由 .spike/gen-trap-stubs.mjs 从 GL/gl.h 原型生成）
void GLAPIENTRY glColorMaterial(GLenum, GLenum) { trapGlCall("glColorMaterial"); }
void GLAPIENTRY glInterleavedArrays(GLenum, GLsizei, const GLvoid*) {
  trapGlCall("glInterleavedArrays");
}
void GLAPIENTRY glLightf(GLenum, GLenum, GLfloat) { trapGlCall("glLightf"); }
void GLAPIENTRY glLightModeli(GLenum, GLint) { trapGlCall("glLightModeli"); }
void GLAPIENTRY glLineStipple(GLint, GLushort) { trapGlCall("glLineStipple"); }
void GLAPIENTRY glLogicOp(GLenum) { trapGlCall("glLogicOp"); }
void GLAPIENTRY glMaterialf(GLenum, GLenum, GLfloat) { trapGlCall("glMaterialf"); }
void GLAPIENTRY glPolygonStipple(const GLubyte*) { trapGlCall("glPolygonStipple"); }
void GLAPIENTRY glTexGendv(GLenum, GLenum, const GLdouble*) { trapGlCall("glTexGendv"); }

}  // extern "C"
