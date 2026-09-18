# ive2glb：IVE → 中间产物的原生转换助手。
# 只依赖 OpenSceneGraph 的 osg / osgDB 与 ive 插件，不链接 Qt、Assimp 或渲染模块。
cmake_minimum_required(VERSION 3.24)

project(ive2glb VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(OpenSceneGraph 3.6 REQUIRED COMPONENTS osg osgDB)

add_executable(ive2glb src/main.cpp)
target_include_directories(ive2glb PRIVATE ${OPENSCENEGRAPH_INCLUDE_DIRS})
target_link_libraries(ive2glb PRIVATE ${OPENSCENEGRAPH_LIBRARIES})

set_target_properties(ive2glb PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    INSTALL_RPATH "@executable_path/lib"
)
