 class Track {
    /**
     *Creates an instance of Roaming.
     * @param {*} viewer 需要传入
     * @param {*} options.speed 速度m/s 需要传入
     * @param {*} options.stayTime 等待时间  需要传入
     * @param {*} options.Lines  点集合 需要传入
     * @param {*} options.shootCallback  拍设点回调函数
     * @memberof Track
     */
    constructor(viewer, options) {
        this.viewer = viewer;
        this.entity = undefined;
        this.Lines = options.Lines;
        this.stayTime = options.stayTime;
        this.stayTimeCalc = options.stayTime;
        this.speed = options.speed;
        this.primitivesone = null;
        this.primitivestwo = null;
        this.spotLightCamera = null;
        this.frustumFar = options.frustumFar;
        this.dataSource;
        // this.RoamingSpeed
        this.onTickstate = false;
        this.shootCallback = options.shootCallback;
        this.TrackPath(options.Lines);
    }

    TrackPath(Lines) {
        var lins = [];
        this.dataSource = new Cesium.CustomDataSource('TrackPath');

        //通过循环添加多个点
        for (let i = 0; i < Lines.length; i++) {
            //从入参获取经纬度和海拔，并转化为笛卡尔坐标
            let LinesIndex = new Cesium.Cartesian3
            .fromDegrees(
                Lines[i].aircraftLongitude, 
                Lines[i].aircraftLatitude, 
                Lines[i].aircraftAltitude
            );
            //添加点：红色，8个像素
            this.dataSource.entities.add({
                position: LinesIndex,
                point: {
                    pixelSize: 8,
                    color: Cesium.Color.RED
                },
            });
            //将经纬度和海拔展平添加到lins数组
            lins.push(Lines[i].aircraftLongitude);
            lins.push(Lines[i].aircraftLatitude);
            lins.push(Lines[i].aircraftAltitude);

        }

        //生成航迹线：即通过一组点来生成折线
        this.dataSource.entities.add({
            polyline: {
                positions: new Cesium.Cartesian3.fromDegreesArrayHeights(lins),
                width: 2,
                material: Cesium.Color.YELLOW
            }
        })

        //将包含航迹的数据源添加到Cesium地图的视图中
        this.viewer.dataSources.add(this.dataSource);
        //改变地图的观察视角到正视图，以便更好地观察绘制的航迹。
        this.ChangePerspective('ViewSide');
    }

    //其目的是启动航迹模拟的飞行过程
    StartFlying() {
        //this.Lines是一个包含飞行路径点信息的数组。ComputeRoamingLineProperty方法负责计算航迹的关键属性，如飞行路径、起始时间和停止时间。
        //这个方法返回一个对象，其中包含了用于飞行模拟的属性（property）、飞行开始时间（startTime）和飞行结束时间（stopTime）
        this.property = this.ComputeRoamingLineProperty(this.Lines);
        //InitRoaming方法负责初始化航迹模拟实体
        //this.property.property：飞行路径属性，是一个SampledPositionProperty对象，表示飞行器在不同时间点的位置。
        //this.property.startTime：飞行开始时间
        //this.property.stopTime：飞行结束时间
        this.InitRoaming(this.property.property, this.property.startTime, this.property.stopTime);
    }
    /**
     * @param {*} Lines 点集合
     * @returns
     * @memberof Track
     */
    ComputeRoamingLineProperty(Lines) {
        this.onTickstate = true;    //onTickstate设置为true，表示开始监听时间变化。
        let startTime = Cesium.JulianDate.fromDate(new Date());
        let stopTime;
        let property = new Cesium.SampledPositionProperty();
        let startWaiting, endWaiting;
        let Waiting = [];
        for (let i = 0, t = 0; i < Lines.length; i++) {
            //计算每个点到下一个点的距离，并根据速度this.speed更新时间t，以模拟飞行时间
            if (i == 0) {
                t = 0;
            } else {
                let p1 = new Cesium.Cartesian3.fromDegrees(Lines[i - 1].aircraftLongitude, Lines[i - 1].aircraftLatitude, Lines[i - 1].aircraftAltitude);
                let p2 = new Cesium.Cartesian3.fromDegrees(Lines[i].aircraftLongitude, Lines[i].aircraftLatitude, Lines[i].aircraftAltitude);
                let d = Cesium.Cartesian3.distance(p1, p2);

                t += d / this.speed;
            }

            //添加循环当前点的位置，开始至现在的时间点到property
            let LinesIndex = new Cesium.Cartesian3.fromDegrees(Lines[i].aircraftLongitude, Lines[i].aircraftLatitude, Lines[i].aircraftAltitude);
            property.addSample(Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate()), LinesIndex);

            //如果当前点是拍摄点（isShoot == true），则在Waiting数组中添加该点的开始等待时间、结束等待时间和拍摄点。同时，增加等待时间t
            if (Lines[i].isShoot == true) {
                startWaiting = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate())
                t += this.stayTime || 1;
                property.addSample(Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate()), LinesIndex);
                endWaiting = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate())
                Waiting.push({
                    startWaiting,
                    endWaiting,
                    shootId: Lines[i].shootId
                })
            }

            if (i == Lines.length - 1) {
                stopTime = Cesium.JulianDate.addSeconds(startTime, t, new Cesium.JulianDate())
            }

        }

        let k = true
        this.viewer.clock.onTick.addEventListener((e) => {  //监听时间变化
            if (this.onTickstate) {
                // console.log(e)
                let finds = false
                for (let i = 0; i < Waiting.length; i++) {
                    if (Waiting[i].startWaiting.secondsOfDay < e.currentTime.secondsOfDay && Waiting[i].endWaiting.secondsOfDay > e.currentTime.secondsOfDay) {
                        if (k) {
                            this.shootCallback(Waiting[i].shootId)
                            this.SetLookCone(Waiting[i].shootId)
                        }
                        finds = true
                        break;
                    }
                }
                if (finds) {
                    k = false
                } else {
                    k = true
                }
            }

        })


        this.viewer.clock.startTime = startTime.clone();
        this.viewer.clock.stopTime = stopTime.clone();
        this.viewer.clock.currentTime = startTime.clone();
        this.viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
        this.viewer.clock.multiplier = 1;
        this.viewer.clock.shouldAnimate = true;

        return {
            property,
            startTime,
            stopTime
        }
    }
    /**
     *
     *
     * @param {*} position computeRoamingLineProperty计算的属性
     * @param {*} isPathShow path路径是否显示
     * @memberof Track
     */
    InitRoaming(position, start, stop) {
        this.entity = this.viewer.entities.add({
            availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({
                start: start,
                stop: stop
            })]),
            // 位置
            position: position,
            // 计算朝向
            // orientation: new Cesium.VelocityOrientationProperty(position),
            // 加载模型
            model: {
                // 模型路径
                uri: "./air.glb",
                // 模型最小刻度
                minimumPixelSize: 64,
                maximumSize: 128,
                // 设置模型最大放大大小
                maximumScale: 200,
                // 模型是否可见
                show: true,
                // 模型轮廓颜色
                silhouetteColor: Cesium.Color.WHITE,
                // 模型颜色  ，这里可以设置颜色的变化
                // color: color,
                // 仅用于调试，显示魔仙绘制时的线框
                debugWireframe: false,
                // 仅用于调试。显示模型绘制时的边界球。
                debugShowBoundingVolume: false,

                scale: 0.02,
                runAnimations: false // 是否运行模型中的动画效果(由于我的模型是不会动所以就很呆哈哈哈)
            },
            path: {
                resolution: 1,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.1,
                    color: Cesium.Color.RED
                }),
                width: 10,
                show: false
            }
        })
        // 
        // this.viewer.trackedEntity = this.entity

    }


    /**
     *航迹模拟的暂停和继续
     *
     * @param {*} state bool类型 false为暂停，ture为继续
     * @memberof Track
     */
    PauseOrContinue(state) {
        this.viewer.clock.shouldAnimate = state
    }

    SetLookCone(value) {

        // this.RemovePrimitives()

        setTimeout(() => {
            this.RemovePrimitives()
        }, this.stayTime * 1000)

        value = this.Lines.filter(function (item) {
            return item.shootId == value;
        });

        value = value[0]
        let positions = new Cesium.Cartesian3.fromDegrees(value.aircraftLongitude, value.aircraftLatitude, value.aircraftAltitude)
        this.spotLightCamera = new Cesium.Camera(this.viewer.scene);
        let spotLightCamera = this.spotLightCamera

        spotLightCamera.setView({
            destination: positions,
            orientation: {
                heading: Cesium.Math.toRadians(value.gimbalYawValue),
                pitch: Cesium.Math.toRadians(value.gimbalPitchValue),
                roll: Cesium.Math.toRadians(0.0)
            }
        });



        let scratchRight = new Cesium.Cartesian3();
        let scratchRotation = new Cesium.Matrix3();
        var scratchOrientation = new Cesium.Quaternion();

        let position = spotLightCamera.positionWC;
        let directions = spotLightCamera.directionWC;
        let up = spotLightCamera.upWC;
        let right = spotLightCamera.rightWC;
        right = Cesium.Cartesian3.negate(right, scratchRight);

        let rotation = scratchRotation;
        Cesium.Matrix3.setColumn(rotation, 0, right, rotation);
        Cesium.Matrix3.setColumn(rotation, 1, up, rotation);
        Cesium.Matrix3.setColumn(rotation, 2, directions, rotation);
        //计算视锥姿态
        let orientation = Cesium.Quaternion.fromRotationMatrix(rotation, scratchOrientation);
        spotLightCamera.frustum.near = 0.1;
        spotLightCamera.frustum.far = this.frustumFar;
        //视锥轮廓线图形

        let instanceOutline = new Cesium.GeometryInstance({
            geometry: new Cesium.FrustumGeometry({
                frustum: spotLightCamera.frustum,
                origin: position,
                orientation: orientation
            }),
            material: Cesium.Color.RED.withAlpha(1),
            id: "pri" + this.viewer.scene.primitives.length + 1,
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(1.0, 1.0, 0.0, 0.5)),
                show: new Cesium.ShowGeometryInstanceAttribute(true)
            }
        });

        let instance = new Cesium.GeometryInstance({
            geometry: new Cesium.FrustumOutlineGeometry({
                frustum: spotLightCamera.frustum,
                origin: position,
                orientation: orientation
            }),
            material: Cesium.Color.RED.withAlpha(0.1),
            id: "pri0" + this.viewer.scene.primitives.length + 1,
            attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(new Cesium.Color(1.0, 0.0, 0.0, 1)),
                show: new Cesium.ShowGeometryInstanceAttribute(true)
            }
        });

        this.primitivesone = this.viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: instance,
            appearance: new Cesium.PerInstanceColorAppearance({
                translucent: true,
                flat: true
            }),
            asynchronous: false
        }));

        this.primitivestwo = this.viewer.scene.primitives.add(new Cesium.Primitive({
            geometryInstances: instanceOutline,
            appearance: new Cesium.PerInstanceColorAppearance({
                translucent: true,
                flat: true
            }),
            asynchronous: false
        }));

    }
    /**
     * 删除视锥
     */
    RemovePrimitives() {
        if (this.primitivesone) {
            this.primitivesone.destroy()
            this.primitivestwo.destroy()
            this.spotLightCamera = null;
        }
    }

    /**
     * 改变观看角度
     *
     * @param {*} name string 
     * 
     * ViewTopDown:顶视图
     * ViewSide ：正视图
     * trackedEntity：跟随模型
     * @memberof Track
     */
    ChangePerspective(name) {
        if (name === "ViewTopDown") {   //从正上方kan
            //首先将this.viewer.trackedEntity设置为undefined，这意味着取消对任何实体的跟踪，使视图不会锁定在某个特定实体上。
            this.viewer.trackedEntity = undefined;
            //眼睛在航迹正上方35高度处
            this.viewer.flyTo(
                this.dataSource, {
                offset: {
                    heading: 0,
                    pitch: Cesium.Math.toRadians(-90),
                    range: 35
                }
            }
            );
        } else if (name === "ViewSide") {   //从边上看：向西15度倾斜向下角
            this.viewer.trackedEntity = undefined;
            this.viewer.flyTo(
                this.dataSource, {
                offset: {
                    heading: Cesium.Math.toRadians(-90),
                    pitch: Cesium.Math.toRadians(-15),
                    range: 50
                }
            }
            );
        } else if (name === "trackedEntity") {  //始终跟随着模型
            this.viewer.trackedEntity = this.entity;
        }

    }
    /**
     *改变飞行的速度
     *
     * @param {*} value  整数类型
     * @memberof Track
     */
    ChangeRoamingSpeed(value) {
        this.viewer.clock.multiplier = value
        this.stayTime = this.stayTimeCalc / value
    }
    /**
     *
     *取消航迹模拟
     * @memberof Track
     */
    EndRoaming() {
        this.onTickstate = false
        if (this.entity !== undefined) {
            this.viewer.entities.remove(this.entity)
        }
        if (this.dataSource !== undefined) {
            this.viewer.dataSources.remove(this.dataSource);
        }
        this.viewer.clock.multiplier = 1;
        this.RemovePrimitives()
    }

}